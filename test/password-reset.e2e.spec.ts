import { Role, UserStatus } from '@prisma/client';
import { hashResetToken } from '../src/auth/password-reset.service';
import { createTestApp, PASSWORD, TestApp, waitFor } from './test-app';

const GENERIC = 'Si existe una cuenta con ese email, te enviamos un link para restablecer la contraseña.';
const NEW_PASSWORD = 'una-clave-nueva-123';

describe('Recuperar contraseña (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(() => t.app.close());

  /** Pide el reset y devuelve el token que llegó por email. */
  async function requestToken(email: string): Promise<string> {
    const calls = t.mail.send.mock.calls.length;
    await t.http.post('/api/auth/password/forgot').send({ email }).expect(200);
    await waitFor(() => t.mail.send.mock.calls.length > calls);
    const { text, to } = t.mail.send.mock.calls.at(-1)[0];
    expect(to).toBe(email);
    const match = /restablecer-contrasena#token=([\w-]+)/.exec(text);
    expect(match).not.toBeNull();
    return match![1];
  }

  it('responde lo mismo exista o no el email, y solo envía mail si existe', async () => {
    await t.insertUser(Role.EMPLOYEE);

    const unknown = await t.http.post('/api/auth/password/forgot').send({ email: 'nadie@test.com' }).expect(200);
    const known = await t.http.post('/api/auth/password/forgot').send({ email: 'employee@test.com' }).expect(200);

    expect(unknown.body).toEqual({ message: GENERIC });
    expect(known.body).toEqual(unknown.body);
    await waitFor(() => t.mail.send.mock.calls.length === 1);
    expect(t.mail.send.mock.calls[0][0].to).toBe('employee@test.com');
  });

  it('guarda solo el hash del token y el link apunta al front con el token en el fragmento', async () => {
    await t.insertUser(Role.EMPLOYEE);
    const token = await requestToken('employee@test.com');

    expect(t.prisma.resetTokens).toHaveLength(1);
    expect(t.prisma.resetTokens[0].tokenHash).toBe(hashResetToken(token));
    expect(t.prisma.resetTokens[0].tokenHash).not.toContain(token);
    expect(t.mail.send.mock.calls[0][0].text).toContain(`http://front.test/restablecer-contrasena#token=${token}`);
  });

  it('cambia la contraseña, inicia sesión y cierra las sesiones anteriores', async () => {
    const user = await t.insertUser(Role.EMPLOYEE);
    const oldToken = await t.jwt.signAsync({
      sub: user.id,
      role: user.role,
      purpose: 'access',
      iat: Math.floor(Date.now() / 1000) - 60,
    });
    await t.http.get('/api/auth/me').auth(oldToken, { type: 'bearer' }).expect(200);

    const token = await requestToken(user.email);
    const res = await t.http.post('/api/auth/password/reset').send({ token, password: NEW_PASSWORD }).expect(200);

    await t.http.get('/api/auth/me').auth(res.body.accessToken, { type: 'bearer' }).expect(200);
    await t.http.get('/api/auth/me').auth(oldToken, { type: 'bearer' }).expect(401);
    await t.http.post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
    await t.http.post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD }).expect(200);
  });

  it('el token es de un solo uso', async () => {
    await t.insertUser(Role.EMPLOYEE);
    const token = await requestToken('employee@test.com');
    await t.http.post('/api/auth/password/reset').send({ token, password: NEW_PASSWORD }).expect(200);
    await t.http.post('/api/auth/password/reset').send({ token, password: 'otra-clave-999' }).expect(400);
  });

  it('rechaza un token vencido, inexistente, o reemplazado por un pedido posterior', async () => {
    await t.insertUser(Role.EMPLOYEE);
    const first = await requestToken('employee@test.com');
    const second = await requestToken('employee@test.com');

    await t.http.post('/api/auth/password/reset').send({ token: first, password: NEW_PASSWORD }).expect(400);
    await t.http
      .post('/api/auth/password/reset')
      .send({ token: 'x'.repeat(43), password: NEW_PASSWORD })
      .expect(400);

    t.prisma.resetTokens[0].expiresAt = new Date(Date.now() - 1000);
    const res = await t.http.post('/api/auth/password/reset').send({ token: second, password: NEW_PASSWORD }).expect(400);
    expect(res.body.message).toMatch(/inválido o venció/);
  });

  it('no envía mail a ADMIN ni a usuarios suspendidos', async () => {
    await t.insertUser(Role.ADMIN);
    await t.insertUser(Role.EMPLOYEE, { status: UserStatus.SUSPENDED });
    await t.http.post('/api/auth/password/forgot').send({ email: 'admin@test.com' }).expect(200);
    await t.http.post('/api/auth/password/forgot').send({ email: 'employee@test.com' }).expect(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(t.mail.send).not.toHaveBeenCalled();
  });

  it('una cuenta creada con Google (sin contraseña) no entra con contraseña hasta definir una', async () => {
    const user = t.prisma.insert({ email: 'social@test.com', role: Role.EMPLOYEE });
    await t.http.post('/api/auth/login').send({ email: user.email, password: 'cualquier-cosa' }).expect(401);

    const token = await requestToken(user.email);
    await t.http.post('/api/auth/password/reset').send({ token, password: NEW_PASSWORD }).expect(200);
    await t.http.post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD }).expect(200);
  });
});
