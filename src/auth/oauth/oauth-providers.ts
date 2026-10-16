import { OAuthProvider } from '@prisma/client';

// Flujo "authorization code" + PKCE contra Google y GitHub, sin librerías: solo fetch.

export interface OAuthProfile {
  providerAccountId: string;
  /** Email verificado por el proveedor, o null si no hay ninguno. */
  verifiedEmail: string | null;
  name: string | null;
}

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

interface ProfileParams {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export interface OAuthProviderClient {
  authorizeUrl(params: AuthorizeParams): string;
  fetchProfile(params: ProfileParams): Promise<OAuthProfile>;
}

async function getJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${new URL(url).host}${new URL(url).pathname} → ${res.status}`);
  return (await res.json()) as T;
}

const google: OAuthProviderClient = {
  authorizeUrl: ({ clientId, redirectUri, state, codeChallenge }) =>
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }),

  async fetchProfile({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
    const token = await getJson<{ access_token: string }>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
    const info = await getJson<{ sub: string; email?: string; email_verified?: boolean; name?: string }>(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    return {
      providerAccountId: info.sub,
      verifiedEmail: info.email && info.email_verified ? info.email : null,
      name: info.name ?? null,
    };
  },
};

const GITHUB_HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'Conecta' };

const github: OAuthProviderClient = {
  authorizeUrl: ({ clientId, redirectUri, state, codeChallenge }) =>
    'https://github.com/login/oauth/authorize?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }),

  async fetchProfile({ clientId, clientSecret, redirectUri, code, codeVerifier }) {
    // GitHub responde 200 con { error } si el código es inválido.
    const token = await getJson<{ access_token?: string; error?: string }>(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      },
    );
    if (!token.access_token) throw new Error(`GitHub token: ${token.error ?? 'sin access_token'}`);

    const headers = { ...GITHUB_HEADERS, Authorization: `Bearer ${token.access_token}` };
    const user = await getJson<{ id: number; name: string | null; login: string }>('https://api.github.com/user', {
      headers,
    });
    const emails = await getJson<{ email: string; primary: boolean; verified: boolean }[]>(
      'https://api.github.com/user/emails',
      { headers },
    );
    const primary = emails.find((e) => e.primary && e.verified);
    return {
      providerAccountId: String(user.id),
      verifiedEmail: primary?.email ?? null,
      name: user.name ?? user.login,
    };
  },
};

export const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderClient> = {
  [OAuthProvider.GOOGLE]: google,
  [OAuthProvider.GITHUB]: github,
};

/** 'google' | 'github' (segmento de la URL) → enum. */
export function parseProvider(slug: string): OAuthProvider | null {
  const upper = slug.toUpperCase();
  return upper in OAUTH_PROVIDERS ? (upper as OAuthProvider) : null;
}
