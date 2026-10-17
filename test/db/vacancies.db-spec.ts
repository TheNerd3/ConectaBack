import { Modality, Role, VacancyStatus, VerificationStatus } from '@prisma/client';
import { createDbApp, DbTestApp, resetDatabase } from './db-app';

// Tests contra Postgres real: filtros, orden y permisos dependen de las consultas de Prisma.

describe('Vacantes (Postgres)', () => {
  let t: DbTestApp;

  beforeEach(async () => {
    t = await createDbApp();
    await resetDatabase(t.prisma);
  });
  afterEach(() => t.app.close());

  // ── Fixtures ──

  async function skills(...names: string[]) {
    const created = await Promise.all(names.map((name) => t.prisma.skill.create({ data: { name } })));
    return Object.fromEntries(created.map((s) => [s.name, s.id]));
  }

  async function company(name: string, opts: { status?: VerificationStatus; seal?: boolean } = {}) {
    const user = await t.prisma.user.create({
      data: {
        email: `${name.toLowerCase().replace(/\W/g, '')}@empresa.test`,
        role: Role.EMPLOYER,
        companyMembers: {
          create: {
            role: 'owner',
            company: {
              create: {
                name,
                verificationStatus: opts.status ?? VerificationStatus.APPROVED,
                transparentSeal: opts.seal ?? false,
              },
            },
          },
        },
      },
      include: { companyMembers: true },
    });
    return { user, companyId: user.companyMembers[0].companyId, token: await t.tokenFor(user) };
  }

  async function employee() {
    const user = await t.prisma.user.create({ data: { email: 'ana@test.com', role: Role.EMPLOYEE } });
    return t.tokenFor(user);
  }

  /** Vacante cargada directo en la DB (con el mismo cálculo de listedSalary que el service). */
  async function vacancy(
    companyId: number,
    data: {
      title: string;
      modality?: Modality;
      location?: string;
      salaryMin?: number | null;
      salaryMax?: number | null;
      showSalary?: boolean;
      status?: VacancyStatus;
      createdAt?: Date;
      skillIds?: number[];
      description?: string;
    },
  ) {
    const showSalary = data.showSalary ?? false;
    const salaryMin = data.salaryMin ?? null;
    const salaryMax = data.salaryMax ?? null;
    return t.prisma.vacancy.create({
      data: {
        companyId,
        title: data.title,
        modality: data.modality ?? Modality.REMOTE,
        location: data.location ?? 'Córdoba, AR',
        description: data.description ?? 'Descripción de prueba suficientemente larga.',
        salaryMin,
        salaryMax,
        showSalary,
        listedSalaryMin: showSalary ? salaryMin : null,
        listedSalaryMax: showSalary ? salaryMax : null,
        status: data.status ?? VacancyStatus.ACTIVE,
        createdAt: data.createdAt,
        skills: { create: (data.skillIds ?? []).map((skillId) => ({ skillId })) },
      },
    });
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const titles = (body: { items: { title: string }[] }) => body.items.map((i) => i.title);

  async function search(token: string, query: Record<string, string | number> = {}) {
    const res = await t.http
      .get('/api/vacancies')
      .query(query)
      .auth(token, { type: 'bearer' })
      .expect(200);
    return res.body;
  }

  const validBody = (skillIds: number[]) => ({
    title: 'Full Stack Developer',
    modality: Modality.HYBRID,
    location: 'Buenos Aires, AR',
    salaryMin: 1_600_000,
    salaryMax: 2_000_000,
    showSalary: true,
    description: 'Buscamos una persona para sumarse al equipo de producto.',
    skillIds,
  });

  // ── Publicación de punta a punta ──

  it('el empleador publica y el empleado la encuentra y ve el detalle', async () => {
    const s = await skills('React', 'Node.js');
    const acme = await company('Acme');
    const emp = await employee();

    const created = await t.http
      .post('/api/employer/vacancies')
      .auth(acme.token, { type: 'bearer' })
      .send(validBody([s.React, s['Node.js']]))
      .expect(201);
    expect(created.body).toMatchObject({ status: 'ACTIVE', salaryMin: 1_600_000, showSalary: true });

    const page = await search(emp, { q: 'full stack' });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      title: 'Full Stack Developer',
      salary: { min: 1_600_000, max: 2_000_000, currency: 'ARS' },
      company: { name: 'Acme', verified: true },
      skills: [{ name: 'Node.js' }, { name: 'React' }],
    });
    expect(page.items[0]).not.toHaveProperty('matchPercent');

    const detail = await t.http
      .get(`/api/vacancies/${created.body.id}`)
      .auth(emp, { type: 'bearer' })
      .expect(200);
    expect(detail.body.description).toContain('Buscamos una persona');
  });

  // ── Permisos ──

  describe('permisos', () => {
    it('un empleador no ve, edita ni pausa vacantes de otra empresa (404) y no se modifican', async () => {
      const s = await skills('React');
      const acme = await company('Acme');
      const other = await company('Otra');
      const v = await vacancy(acme.companyId, { title: 'Original', skillIds: [s.React] });

      await t.http.get(`/api/employer/vacancies/${v.id}`).auth(other.token, { type: 'bearer' }).expect(404);
      await t.http
        .patch(`/api/employer/vacancies/${v.id}`)
        .auth(other.token, { type: 'bearer' })
        .send({ title: 'Hackeada' })
        .expect(404);
      await t.http
        .patch(`/api/employer/vacancies/${v.id}/status`)
        .auth(other.token, { type: 'bearer' })
        .send({ status: 'PAUSED' })
        .expect(404);

      const after = await t.prisma.vacancy.findUniqueOrThrow({ where: { id: v.id } });
      expect(after).toMatchObject({ title: 'Original', status: VacancyStatus.ACTIVE });

      const list = await t.http.get('/api/employer/vacancies').auth(other.token, { type: 'bearer' }).expect(200);
      expect(list.body.items).toHaveLength(0);
    });

    it('una empresa no verificada no puede publicar ni editar, pero ve su estado', async () => {
      const s = await skills('React');
      const pending = await company('Pendiente', { status: VerificationStatus.PENDING });
      const v = await vacancy(pending.companyId, { title: 'Vieja' });

      const res = await t.http
        .post('/api/employer/vacancies')
        .auth(pending.token, { type: 'bearer' })
        .send(validBody([s.React]))
        .expect(403);
      expect(res.body.message).toMatch(/todavía no fue verificada/);
      await t.http
        .patch(`/api/employer/vacancies/${v.id}`)
        .auth(pending.token, { type: 'bearer' })
        .send({ title: 'Nueva' })
        .expect(403);

      const list = await t.http.get('/api/employer/vacancies').auth(pending.token, { type: 'bearer' }).expect(200);
      expect(list.body.company).toMatchObject({ verificationStatus: 'PENDING', canPublish: false });
    });

    it('cada rol solo usa sus endpoints', async () => {
      const acme = await company('Acme');
      const emp = await employee();
      await t.http.get('/api/employer/vacancies').auth(emp, { type: 'bearer' }).expect(403);
      await t.http.post('/api/employer/vacancies').auth(emp, { type: 'bearer' }).send({}).expect(403);
      await t.http.get('/api/vacancies').auth(acme.token, { type: 'bearer' }).expect(403);
      await t.http.get('/api/vacancies').expect(401);
    });

    it('valida rango salarial y skills del catálogo', async () => {
      const s = await skills('React');
      const acme = await company('Acme');
      const post = (body: object) =>
        t.http.post('/api/employer/vacancies').auth(acme.token, { type: 'bearer' }).send(body);

      await post({ ...validBody([s.React]), salaryMin: 2_000_000, salaryMax: 1_000_000 }).expect(400);
      await post({ ...validBody([999]) }).expect(400);
      await post({ ...validBody([]) }).expect(400);
      await post({ ...validBody([s.React]), salaryMin: null, salaryMax: null, showSalary: true }).expect(400);
      await post({ ...validBody([s.React]), modality: 'MARTE' }).expect(400);
    });
  });

  // ── Visibilidad del salario ──

  describe('salario', () => {
    it('no se devuelve si showSalary = false (lista y detalle), pero el dueño lo ve', async () => {
      const acme = await company('Acme');
      const emp = await employee();
      const v = await vacancy(acme.companyId, { title: 'Oculto', salaryMin: 7_777_777, salaryMax: 8_888_888 });

      const list = await t.http.get('/api/vacancies').auth(emp, { type: 'bearer' }).expect(200);
      const detail = await t.http.get(`/api/vacancies/${v.id}`).auth(emp, { type: 'bearer' }).expect(200);
      expect(list.body.items[0].salary).toBeNull();
      expect(detail.body.salary).toBeNull();
      expect(JSON.stringify(list.body) + JSON.stringify(detail.body)).not.toMatch(/7777777|8888888/);

      const own = await t.http.get(`/api/employer/vacancies/${v.id}`).auth(acme.token, { type: 'bearer' }).expect(200);
      expect(own.body).toMatchObject({ salaryMin: 7_777_777, salaryMax: 8_888_888, showSalary: false });
    });

    it('los filtros de salario no matchean salarios ocultos (no se pueden deducir)', async () => {
      const acme = await company('Acme');
      const emp = await employee();
      await vacancy(acme.companyId, { title: 'Visible', salaryMin: 1_000_000, salaryMax: 1_500_000, showSalary: true });
      await vacancy(acme.companyId, { title: 'Oculto', salaryMin: 1_000_000, salaryMax: 1_500_000 });

      expect(titles(await search(emp, { salaryMin: 1_200_000 }))).toEqual(['Visible']);
      expect(titles(await search(emp, { salaryMax: 1_100_000 }))).toEqual(['Visible']);
      expect(titles(await search(emp, { salaryMin: 2_000_000 }))).toEqual([]);
    });

    it('al ocultar el salario editando, deja de poder filtrarse', async () => {
      const s = await skills('React');
      const acme = await company('Acme');
      const emp = await employee();
      const created = await t.http
        .post('/api/employer/vacancies')
        .auth(acme.token, { type: 'bearer' })
        .send(validBody([s.React]))
        .expect(201);
      expect(titles(await search(emp, { salaryMin: 1_700_000 }))).toHaveLength(1);

      await t.http
        .patch(`/api/employer/vacancies/${created.body.id}`)
        .auth(acme.token, { type: 'bearer' })
        .send({ showSalary: false })
        .expect(200);
      expect(titles(await search(emp, { salaryMin: 1_700_000 }))).toHaveLength(0);
      expect((await search(emp)).items[0].salary).toBeNull();
    });
  });

  // ── Filtros ──

  describe('filtros', () => {
    it('texto (puesto, empresa, skill), modalidad, ubicación y skills (todas)', async () => {
      const s = await skills('React', 'Python', 'Docker');
      const acme = await company('Nimbus Software');
      const emp = await employee();
      await vacancy(acme.companyId, {
        title: 'Frontend React',
        modality: Modality.REMOTE,
        location: 'Córdoba, AR',
        skillIds: [s.React, s.Docker],
      });
      await vacancy(acme.companyId, {
        title: 'Data Engineer',
        modality: Modality.HYBRID,
        location: 'Buenos Aires, AR',
        skillIds: [s.Python, s.Docker],
      });
      await vacancy(acme.companyId, { title: 'Soporte', modality: Modality.ONSITE, location: 'Rosario, AR' });

      expect(titles(await search(emp, { q: 'frontend' }))).toEqual(['Frontend React']);
      expect(titles(await search(emp, { q: 'nimbus' }))).toHaveLength(3);
      expect(titles(await search(emp, { q: 'python' }))).toEqual(['Data Engineer']);
      expect(titles(await search(emp, { modality: 'REMOTE,HYBRID' })).sort()).toEqual(['Data Engineer', 'Frontend React']);
      expect(titles(await search(emp, { location: 'buenos' }))).toEqual(['Data Engineer']);
      expect(titles(await search(emp, { skillIds: `${s.Docker}` })).sort()).toEqual(['Data Engineer', 'Frontend React']);
      expect(titles(await search(emp, { skillIds: `${s.Docker},${s.React}` }))).toEqual(['Frontend React']);
    });

    it('rechaza filtros inválidos', async () => {
      const emp = await employee();
      await t.http.get('/api/vacancies').query({ modality: 'MARTE' }).auth(emp, { type: 'bearer' }).expect(400);
      await t.http.get('/api/vacancies').query({ pageSize: 500 }).auth(emp, { type: 'bearer' }).expect(400);
      await t.http.get('/api/vacancies').query({ sort: 'match' }).auth(emp, { type: 'bearer' }).expect(400);
    });
  });

  // ── Orden y visibilidad ──

  describe('orden y visibilidad', () => {
    it('las de empresas con sello van primero, pero ninguna se oculta', async () => {
      const sealed = await company('Transparente SA', { seal: true });
      const plain = await company('Común SRL');
      const emp = await employee();
      await vacancy(plain.companyId, { title: 'Común nueva', createdAt: daysAgo(0) });
      await vacancy(sealed.companyId, { title: 'Sello vieja', createdAt: daysAgo(10) });
      await vacancy(plain.companyId, { title: 'Común vieja', createdAt: daysAgo(5) });

      const page = await search(emp);
      expect(titles(page)).toEqual(['Sello vieja', 'Común nueva', 'Común vieja']);
      expect(page.items.map((i: { featured: boolean }) => i.featured)).toEqual([true, false, false]);
      expect(page.total).toBe(3);
    });

    it('orden por salario: los salarios ocultos van al final por fecha, sin importar su valor', async () => {
      const acme = await company('Acme');
      const emp = await employee();
      await vacancy(acme.companyId, { title: 'Oculta alta', salaryMax: 9_000_000, createdAt: daysAgo(3) });
      await vacancy(acme.companyId, { title: 'Oculta baja', salaryMax: 100, createdAt: daysAgo(1) });
      await vacancy(acme.companyId, { title: 'Visible 1M', salaryMax: 1_000_000, showSalary: true });
      await vacancy(acme.companyId, { title: 'Visible 2M', salaryMax: 2_000_000, showSalary: true });

      expect(titles(await search(emp, { sort: 'salary' }))).toEqual([
        'Visible 2M',
        'Visible 1M',
        'Oculta baja',
        'Oculta alta',
      ]);
    });

    it('no muestra vacantes pausadas ni de empresas no verificadas (tampoco en el detalle)', async () => {
      const acme = await company('Acme');
      const pending = await company('Pendiente', { status: VerificationStatus.PENDING });
      const emp = await employee();
      const paused = await vacancy(acme.companyId, { title: 'Pausada', status: VacancyStatus.PAUSED });
      const unverified = await vacancy(pending.companyId, { title: 'No verificada' });
      await vacancy(acme.companyId, { title: 'Activa' });

      expect(titles(await search(emp))).toEqual(['Activa']);
      await t.http.get(`/api/vacancies/${paused.id}`).auth(emp, { type: 'bearer' }).expect(404);
      await t.http.get(`/api/vacancies/${unverified.id}`).auth(emp, { type: 'bearer' }).expect(404);
    });

    it('pausar la saca de la búsqueda y reactivar la devuelve', async () => {
      const acme = await company('Acme');
      const emp = await employee();
      const v = await vacancy(acme.companyId, { title: 'Ida y vuelta' });
      const setStatus = (status: string) =>
        t.http
          .patch(`/api/employer/vacancies/${v.id}/status`)
          .auth(acme.token, { type: 'bearer' })
          .send({ status })
          .expect(200);

      await setStatus('PAUSED');
      expect((await search(emp)).total).toBe(0);
      await setStatus('ACTIVE');
      expect(titles(await search(emp))).toEqual(['Ida y vuelta']);
    });

    it('pagina con totales correctos', async () => {
      const acme = await company('Acme');
      const emp = await employee();
      for (let i = 1; i <= 5; i++) await vacancy(acme.companyId, { title: `V${i}`, createdAt: daysAgo(i) });

      const p1 = await search(emp, { pageSize: 2, page: 1 });
      const p3 = await search(emp, { pageSize: 2, page: 3 });
      expect(p1).toMatchObject({ total: 5, totalPages: 3, page: 1, pageSize: 2 });
      expect(titles(p1)).toEqual(['V1', 'V2']);
      expect(titles(p3)).toEqual(['V5']);
    });
  });

  // ── Lista del empleador ──

  it('la lista del empleador trae su empresa, estadísticas y conteos de postulaciones', async () => {
    const acme = await company('Acme', { seal: true });
    await vacancy(acme.companyId, { title: 'Activa' });
    await vacancy(acme.companyId, { title: 'Pausada', status: VacancyStatus.PAUSED });

    const res = await t.http.get('/api/employer/vacancies').auth(acme.token, { type: 'bearer' }).expect(200);
    expect(res.body.company).toMatchObject({ name: 'Acme', canPublish: true, transparentSeal: true });
    expect(res.body.stats).toEqual({ activeVacancies: 1, inReview: 0, inInterview: 0, avgResponseHours: null });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ featured: true, applications: { total: 0, review: 0, interview: 0 } });
  });

  it('skills: busca en el catálogo sin distinguir mayúsculas', async () => {
    await skills('React', 'React Native', 'Python');
    const emp = await employee();
    const res = await t.http.get('/api/skills').query({ q: 'react' }).auth(emp, { type: 'bearer' }).expect(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(['React', 'React Native']);
  });
});
