import { Controller, Get, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import { generate, generateSecret } from 'otplib';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { encrypt, parseEncryptionKey } from '../src/common/crypto';
import { FakePrisma } from './fake-prisma';
import { createTestApp, PASSWORD, TestApp } from './test-app';

// Rutas que solo existen en el test, para verificar los guards globales.
@Controller('test')
class GuardProbeController {
  @Roles(Role.ADMIN)
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }

  @Roles(Role.EMPLOYER)
  @Get('employer-only')
  employerOnly() {
    return { ok: true };
  }

  // Sin @Public() ni @Roles(): debe denegarse aunque haya token.
  @Get('undeclared')
  undeclared() {
    return { ok: true };
  }
}

describe('Auth (e2e)', () => {
  let t: TestApp;
  let app: INestApplication;
  let prisma: FakePrisma;
  let jwt: JwtService;
  let http: TestApp['http'];

  // App nueva por test: el rate limit (en memoria) no se arrastra entre tests.
  beforeEach(async () => {
    t = await createTestApp([GuardProbeController]);
    ({ app, prisma, jwt, http } = t);
  });

  afterEach(() => app.close());

  const insertUser: TestApp['insertUser'] = (role, extra) => t.insertUser(role, extra);
  const tokenFor: TestApp['tokenFor'] = (user, purpose) => t.tokenFor(user, purpose);

  async function insertAdmin() {
    const secret = generateSecret();
    const key = parseEncryptionKey(process.env.ENCRYPTION_KEY);
    const admin = await insertUser(Role.ADMIN, { totpSecretEncrypted: encrypt(secret, key) });
    return { admin, secret };
  }

  describe('registro', () => {
    it('registra un EMPLOYEE con perfil y devuelve un token que sirve para /auth/me', async () => {
      const res = await http
        .post('/api/auth/register/employee')
        .send({ email: ' Ana@Email.com ', password: PASSWORD, fullName: 'Ana Pérez' })
        .expect(201);

      expect(res.body).toEqual({ accessToken: expect.any(String) });
      expect(prisma.users[0]).toMatchObject({
        email: 'ana@email.com',
        role: Role.EMPLOYEE,
        relations: { employeeProfile: { create: { fullName: 'Ana Pérez' } } },
      });
      expect(prisma.users[0].passwordHash).toMatch(/^\$argon2id\$/);

      const me = await http.get('/api/auth/me').auth(res.body.accessToken, { type: 'bearer' }).expect(200);
      expect(me.body).toEqual({
        id: 1,
        email: 'ana@email.com',
        role: Role.EMPLOYEE,
        status: UserStatus.ACTIVE,
        mascotEnabled: true,
      });
    });

    it('registra un EMPLOYER creando la empresa PENDING y la membresía owner', async () => {
      await http
        .post('/api/auth/register/employer')
        .send({ email: 'rrhh@acme.com', password: PASSWORD, companyName: 'Acme' })
        .expect(201);

      expect(prisma.users[0]).toMatchObject({
        role: Role.EMPLOYER,
        relations: { companyMembers: { create: { role: 'owner', company: { create: { name: 'Acme' } } } } },
      });
      // verificationStatus no se envía: queda el default PENDING del esquema.
      const company = (prisma.users[0].relations as any).companyMembers.create.company.create;
      expect(company.verificationStatus).toBeUndefined();
    });

    it('no permite registrarse como ADMIN ni enviar campos extra', async () => {
      await http
        .post('/api/auth/register/employee')
        .send({ email: 'x@x.com', password: PASSWORD, fullName: 'Xi Li', role: 'ADMIN' })
        .expect(201);
      expect(prisma.users[0].role).toBe(Role.EMPLOYEE);
    });

    it('valida el DTO (400) y responde 409 si el email ya está en uso', async () => {
      await http.post('/api/auth/register/employee').send({ email: 'no-es-email', password: '123' }).expect(400);

      const body = { email: 'ana@email.com', password: PASSWORD, fullName: 'Ana' };
      await http.post('/api/auth/register/employee').send(body).expect(201);
      await http.post('/api/auth/register/employee').send(body).expect(409);
    });
  });

  describe('login', () => {
    it('login correcto devuelve un access token y nunca el passwordHash', async () => {
      await insertUser(Role.EMPLOYEE);
      const res = await http.post('/api/auth/login').send({ email: 'employee@test.com', password: PASSWORD }).expect(200);

      expect(res.body).toEqual({ accessToken: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toContain('argon2');
      expect(jwt.decode(res.body.accessToken)).toMatchObject({ purpose: 'access', role: Role.EMPLOYEE });
    });

    it('contraseña incorrecta y email inexistente devuelven el mismo error genérico', async () => {
      await insertUser(Role.EMPLOYEE);
      const wrong = await http.post('/api/auth/login').send({ email: 'employee@test.com', password: 'otra-clave' }).expect(401);
      const unknown = await http.post('/api/auth/login').send({ email: 'nadie@test.com', password: PASSWORD }).expect(401);

      expect(wrong.body.message).toBe('Credenciales inválidas');
      expect(unknown.body).toEqual(wrong.body);
    });

    it('un usuario SUSPENDED no puede loguearse y su token deja de servir', async () => {
      const user = await insertUser(Role.EMPLOYEE, { status: UserStatus.SUSPENDED });

      const res = await http.post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
      expect(res.body.message).toBe('Credenciales inválidas');

      await http.get('/api/auth/me').auth(await tokenFor(user), { type: 'bearer' }).expect(401);
    });

    it('limita los intentos de login por IP (429)', async () => {
      const body = { email: 'nadie@test.com', password: 'x' };
      for (let i = 0; i < 5; i++) await http.post('/api/auth/login').send(body).expect(401);
      await http.post('/api/auth/login').send(body).expect(429);
    });
  });

  describe('acceso por rol (denegar por defecto)', () => {
    it('sin token responde 401; /health es público', async () => {
      await http.get('/api/auth/me').expect(401);
      await http.get('/api/test/admin-only').expect(401);
      await http.get('/api/health').expect(200);
    });

    it('un EMPLOYEE no entra a rutas de ADMIN ni de EMPLOYER', async () => {
      const token = await tokenFor(await insertUser(Role.EMPLOYEE));
      await http.get('/api/test/admin-only').auth(token, { type: 'bearer' }).expect(403);
      await http.get('/api/test/employer-only').auth(token, { type: 'bearer' }).expect(403);
    });

    it('un EMPLOYER no entra a rutas de ADMIN', async () => {
      const token = await tokenFor(await insertUser(Role.EMPLOYER));
      await http.get('/api/test/admin-only').auth(token, { type: 'bearer' }).expect(403);
      await http.get('/api/test/employer-only').auth(token, { type: 'bearer' }).expect(200);
    });

    it('un endpoint sin @Roles() se deniega aunque el token sea válido', async () => {
      const { admin } = await insertAdmin();
      await http.get('/api/test/undeclared').auth(await tokenFor(admin), { type: 'bearer' }).expect(403);
    });

    it('rechaza tokens firmados con otro secreto', async () => {
      const user = await insertUser(Role.ADMIN);
      const forged = new JwtService({ secret: 'otro-secreto-de-al-menos-32-caracteres!!' }).sign({
        sub: user.id,
        role: Role.ADMIN,
        purpose: 'access',
      });
      await http.get('/api/test/admin-only').auth(forged, { type: 'bearer' }).expect(401);
    });
  });

  describe('2FA de ADMIN', () => {
    it('flujo completo: credenciales → challengeToken → código TOTP → access token de ADMIN', async () => {
      const { secret } = await insertAdmin();

      const step1 = await http.post('/api/auth/login').send({ email: 'admin@test.com', password: PASSWORD }).expect(200);
      expect(step1.body).toEqual({ requires2fa: true, challengeToken: expect.any(String) });
      expect(step1.body.accessToken).toBeUndefined();

      const code = await generate({ secret });
      const step2 = await http
        .post('/api/auth/login/2fa')
        .send({ challengeToken: step1.body.challengeToken, code: `${code.slice(0, 3)} ${code.slice(3)}` })
        .expect(200);

      await http.get('/api/test/admin-only').auth(step2.body.accessToken, { type: 'bearer' }).expect(200);
      const me = await http.get('/api/auth/me').auth(step2.body.accessToken, { type: 'bearer' }).expect(200);
      expect(me.body).not.toHaveProperty('totpSecretEncrypted');
      expect(me.body).not.toHaveProperty('passwordHash');
    });

    it('el challengeToken (purpose "2fa") no sirve como access token', async () => {
      const { admin } = await insertAdmin();
      const step1 = await http.post('/api/auth/login').send({ email: admin.email, password: PASSWORD }).expect(200);

      expect(jwt.decode(step1.body.challengeToken)).toMatchObject({ purpose: '2fa' });
      await http.get('/api/auth/me').auth(step1.body.challengeToken, { type: 'bearer' }).expect(401);
      await http.get('/api/test/admin-only').auth(step1.body.challengeToken, { type: 'bearer' }).expect(401);
    });

    it('rechaza un código incorrecto', async () => {
      const { admin } = await insertAdmin();
      const challengeToken = await tokenFor(admin, '2fa');
      const res = await http.post('/api/auth/login/2fa').send({ challengeToken, code: '000000' }).expect(401);
      expect(res.body.message).toBe('Código inválido o vencido');
    });

    it('rechaza un access token usado como challenge y un challenge vencido', async () => {
      const { admin, secret } = await insertAdmin();
      const code = await generate({ secret });

      const accessToken = await tokenFor(admin, 'access');
      await http.post('/api/auth/login/2fa').send({ challengeToken: accessToken, code }).expect(401);

      // Firmado con el mismo secreto pero sin el expiresIn por defecto, para fijar un exp pasado.
      const expired = new JwtService({ secret: process.env.JWT_SECRET }).sign({
        sub: admin.id,
        role: Role.ADMIN,
        purpose: '2fa',
        exp: Math.floor(Date.now() / 1000) - 10,
      });
      await http.post('/api/auth/login/2fa').send({ challengeToken: expired, code }).expect(401);
    });

    it('un ADMIN sin 2FA configurado no puede ingresar', async () => {
      await insertUser(Role.ADMIN);
      await http.post('/api/auth/login').send({ email: 'admin@test.com', password: PASSWORD }).expect(401);
    });
  });
});
