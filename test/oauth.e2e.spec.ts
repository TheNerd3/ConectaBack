import { OAuthProvider, Role, UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { OAUTH_PROVIDERS } from '../src/auth/oauth/oauth-providers';
import { createTestApp, TestApp } from './test-app';

interface GoogleUser {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

const ANA: GoogleUser = { sub: 'google-123', email: 'Ana@Gmail.com', email_verified: true, name: 'Ana Google' };

/** Simula los endpoints de Google. Devuelve los bodies enviados al endpoint de token. */
function mockGoogle(user: GoogleUser | 'token-error') {
  const tokenRequests: URLSearchParams[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenRequests.push(new URLSearchParams(String(init?.body)));
      if (user === 'token-error') return new Response('{"error":"invalid_grant"}', { status: 400 });
      return Response.json({ access_token: 'google-access-token' });
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return Response.json(user);
    throw new Error(`fetch inesperado: ${url}`);
  });
  return tokenRequests;
}

/** Parámetros que la API deja en el fragmento de /auth/callback del front. */
function frontParams(location: string) {
  const url = new URL(location);
  expect(`${url.origin}${url.pathname}`).toBe('http://front.test/auth/callback');
  return new URLSearchParams(url.hash.slice(1));
}

describe('OAuth Google/GitHub (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await t.app.close();
  });

  /** Paso 1: /auth/oauth/google → devuelve state, code_challenge y la cookie de estado. */
  async function start(role?: Role) {
    const res = await t.http.get(`/api/auth/oauth/google${role ? `?role=${role}` : ''}`).expect(302);
    const authorize = new URL(res.headers.location);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('conecta_oauth='));
    return {
      authorize,
      state: authorize.searchParams.get('state')!,
      challenge: authorize.searchParams.get('code_challenge')!,
      cookie: cookie!.split(';')[0],
      rawCookie: cookie!,
    };
  }

  /** Paso 2: vuelta del proveedor → devuelve los parámetros que recibe el front. */
  async function callback(query: Record<string, string>, cookie?: string) {
    const req = t.http.get(`/api/auth/oauth/google/callback?${new URLSearchParams(query)}`);
    const res = await (cookie ? req.set('Cookie', cookie) : req).expect(302);
    return frontParams(res.headers.location);
  }

  async function loginWithGoogle(user: GoogleUser, role?: Role) {
    mockGoogle(user);
    const s = await start(role);
    return callback({ code: 'auth-code', state: s.state }, s.cookie);
  }

  it('redirige a Google con state, PKCE (S256) y una cookie httpOnly de estado', async () => {
    const s = await start();
    expect(s.authorize.origin + s.authorize.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(s.authorize.searchParams.get('client_id')).toBe('google-client-id');
    expect(s.authorize.searchParams.get('redirect_uri')).toBe('http://api.test/api/auth/oauth/google/callback');
    expect(s.authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(s.state.length).toBeGreaterThanOrEqual(32);
    expect(s.rawCookie).toMatch(/HttpOnly/);
    expect(s.rawCookie).toMatch(/SameSite=Lax/);
    expect(s.rawCookie).toMatch(/Path=\/api\/auth\/oauth/);
  });

  it('crea un EMPLOYEE nuevo sin contraseña y entrega un código de un solo uso', async () => {
    const tokenRequests = mockGoogle(ANA);
    const s = await start();
    const params = await callback({ code: 'auth-code', state: s.state }, s.cookie);

    // El verifier enviado a Google corresponde al challenge del paso 1.
    const verifier = tokenRequests[0].get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(s.challenge);

    expect(params.get('perfil')).toBe('empleado');
    const code = params.get('code')!;
    const res = await t.http.post('/api/auth/oauth/exchange').send({ code }).expect(200);
    const me = await t.http.get('/api/auth/me').auth(res.body.accessToken, { type: 'bearer' }).expect(200);
    expect(me.body).toMatchObject({ email: 'ana@gmail.com', role: Role.EMPLOYEE });

    expect(t.prisma.users[0]).toMatchObject({
      passwordHash: null,
      relations: { employeeProfile: { create: { fullName: 'Ana Google' } } },
    });
    expect(t.prisma.oauthAccounts).toEqual([
      expect.objectContaining({ provider: OAuthProvider.GOOGLE, providerAccountId: 'google-123' }),
    ]);

    await t.http.post('/api/auth/oauth/exchange').send({ code }).expect(401);
  });

  it('vincula una cuenta existente con el mismo email verificado y la reconoce después por el id del proveedor', async () => {
    const existing = await t.insertUser(Role.EMPLOYEE, { email: 'ana@gmail.com' });

    const first = await loginWithGoogle(ANA);
    await t.http.post('/api/auth/oauth/exchange').send({ code: first.get('code') }).expect(200);
    expect(t.prisma.users).toHaveLength(1);
    expect(t.prisma.oauthAccounts[0].userId).toBe(existing.id);

    jest.restoreAllMocks();
    // Aunque cambie el email en Google, se resuelve por el id vinculado.
    const second = await loginWithGoogle({ ...ANA, email: 'ana.nueva@gmail.com' });
    const res = await t.http.post('/api/auth/oauth/exchange').send({ code: second.get('code') }).expect(200);
    expect(t.jwt.decode(res.body.accessToken)).toMatchObject({ sub: existing.id });
  });

  it('una cuenta EMPLOYER existente entra con su rol aunque use el botón del lado empleado', async () => {
    await t.insertUser(Role.EMPLOYER, { email: 'ana@gmail.com' });
    const params = await loginWithGoogle(ANA, Role.EMPLOYEE);
    const res = await t.http.post('/api/auth/oauth/exchange').send({ code: params.get('code') }).expect(200);
    expect(t.jwt.decode(res.body.accessToken)).toMatchObject({ role: Role.EMPLOYER });
  });

  it('no vincula si el email no está verificado y no crea la cuenta', async () => {
    await t.insertUser(Role.EMPLOYEE, { email: 'ana@gmail.com' });
    const params = await loginWithGoogle({ ...ANA, email_verified: false });
    expect(params.get('error')).toBe('email_not_verified');
    expect(t.prisma.oauthAccounts).toHaveLength(0);
  });

  it('nunca loguea ni vincula una cuenta ADMIN, ni una suspendida', async () => {
    await t.insertUser(Role.ADMIN, { email: 'ana@gmail.com' });
    expect((await loginWithGoogle(ANA)).get('error')).toBe('not_allowed');
    expect(t.prisma.oauthAccounts).toHaveLength(0);

    jest.restoreAllMocks();
    await t.insertUser(Role.EMPLOYEE, { email: 'suspendida@gmail.com', status: UserStatus.SUSPENDED });
    expect((await loginWithGoogle({ ...ANA, sub: 'otro', email: 'suspendida@gmail.com' })).get('error')).toBe(
      'not_allowed',
    );
  });

  it('rechaza un state distinto o una vuelta sin cookie', async () => {
    mockGoogle(ANA);
    const s = await start();
    expect((await callback({ code: 'auth-code', state: 'otro-state' }, s.cookie)).get('error')).toBe('state');
    expect((await callback({ code: 'auth-code', state: s.state })).get('error')).toBe('state');
    expect(t.prisma.users).toHaveLength(0);
  });

  it('informa cancelación y errores del proveedor', async () => {
    mockGoogle('token-error');
    const s = await start();
    expect((await callback({ error: 'access_denied', state: s.state }, s.cookie)).get('error')).toBe('cancelled');
    const s2 = await start();
    expect((await callback({ code: 'auth-code', state: s2.state }, s2.cookie)).get('error')).toBe('provider');
  });

  it('un proveedor sin credenciales o desconocido vuelve al front con error', async () => {
    const github = await t.http.get('/api/auth/oauth/github?role=EMPLOYER').expect(302);
    const params = frontParams(github.headers.location);
    expect(params.get('error')).toBe('provider_not_configured');
    expect(params.get('perfil')).toBe('empleador');

    const unknown = await t.http.get('/api/auth/oauth/facebook').expect(302);
    expect(frontParams(unknown.headers.location).get('error')).toBe('provider_not_configured');
  });

  it('registro de EMPLOYER: pide el nombre de la empresa y crea cuenta, empresa PENDING y vínculo', async () => {
    const params = await loginWithGoogle(ANA, Role.EMPLOYER);
    expect(params.get('perfil')).toBe('empleador');
    expect(params.get('code')).toBeNull();
    expect(t.prisma.users).toHaveLength(0);

    const signupToken = params.get('signup')!;
    await t.http.post('/api/auth/oauth/complete-employer').send({ signupToken, companyName: 'x' }).expect(400);
    const res = await t.http
      .post('/api/auth/oauth/complete-employer')
      .send({ signupToken, companyName: 'Acme' })
      .expect(201);

    expect(t.jwt.decode(res.body.accessToken)).toMatchObject({ role: Role.EMPLOYER });
    expect(t.prisma.users[0]).toMatchObject({
      email: 'ana@gmail.com',
      passwordHash: null,
      relations: { companyMembers: { create: { role: 'owner', company: { create: { name: 'Acme' } } } } },
    });
    expect(t.prisma.oauthAccounts[0]).toMatchObject({ provider: OAuthProvider.GOOGLE, userId: t.prisma.users[0].id });

    // El mismo token no crea una segunda cuenta.
    await t.http.post('/api/auth/oauth/complete-employer').send({ signupToken, companyName: 'Acme' }).expect(409);
  });

  it('el token de registro de empleador no sirve como access token ni se puede falsificar', async () => {
    const params = await loginWithGoogle(ANA, Role.EMPLOYER);
    await t.http.get('/api/auth/me').auth(params.get('signup')!, { type: 'bearer' }).expect(401);

    const accessToken = await t.tokenFor(await t.insertUser(Role.EMPLOYEE));
    await t.http
      .post('/api/auth/oauth/complete-employer')
      .send({ signupToken: accessToken, companyName: 'Acme' })
      .expect(401);
  });
});

describe('Cliente OAuth de GitHub', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockGitHub(emails: { email: string; primary: boolean; verified: boolean }[]) {
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'gh-token' });
      if (url === 'https://api.github.com/user') return Response.json({ id: 42, name: null, login: 'ana-dev' });
      if (url === 'https://api.github.com/user/emails') return Response.json(emails);
      throw new Error(`fetch inesperado: ${url}`);
    });
  }

  const params = { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://x', code: 'c', codeVerifier: 'v' };

  it('usa el email primario y verificado, y el login como nombre si no hay nombre', async () => {
    mockGitHub([
      { email: 'otro@x.com', primary: false, verified: true },
      { email: 'ana@x.com', primary: true, verified: true },
    ]);
    await expect(OAUTH_PROVIDERS.GITHUB.fetchProfile(params)).resolves.toEqual({
      providerAccountId: '42',
      verifiedEmail: 'ana@x.com',
      name: 'ana-dev',
    });
  });

  it('sin email primario verificado devuelve verifiedEmail null', async () => {
    mockGitHub([{ email: 'ana@x.com', primary: true, verified: false }]);
    await expect(OAUTH_PROVIDERS.GITHUB.fetchProfile(params)).resolves.toMatchObject({ verifiedEmail: null });
  });
});
