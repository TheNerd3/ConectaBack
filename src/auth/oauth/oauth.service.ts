import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuthProvider, Prisma, Role, UserStatus } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_USER_SELECT, AuthService } from '../auth.service';
import type { AuthUser } from '../auth.types';
import { AccessTokenDto } from '../dto/auth-response.dto';
import { CompleteEmployerSignupDto, OAuthRole } from '../dto/oauth.dto';
import { OAUTH_PROVIDERS, OAuthProfile } from './oauth-providers';

export const OAUTH_STATE_COOKIE = 'conecta_oauth';
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const SIGNUP_TTL_SECONDS = 15 * 60;
const LOGIN_CODE_TTL_MS = 60 * 1000;

/** Errores que el front muestra en /auth/callback. */
export type OAuthErrorCode =
  | 'provider_not_configured'
  | 'cancelled'
  | 'state'
  | 'provider'
  | 'email_not_verified'
  | 'not_allowed';

class OAuthFlowError extends Error {
  constructor(readonly code: OAuthErrorCode) {
    super(code);
  }
}

interface StatePayload {
  purpose: 'oauth-state';
  provider: OAuthProvider;
  role: OAuthRole;
  state: string;
  verifier: string;
}

interface SignupPayload {
  purpose: 'oauth-signup';
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string | null;
}

const base64url = (bytes = 32) => randomBytes(bytes).toString('base64url');
const sameString = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly frontUrl: string;
  private readonly apiUrl: string;
  /**
   * Códigos de un solo uso (60 s) que el front canjea por el access token, para que el JWT no viaje en la URL.
   * En memoria: alcanza con una sola instancia de la API (mejora pendiente: Redis/DB si se escala).
   */
  private readonly loginCodes = new Map<string, { userId: number; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {
    this.frontUrl = config.get<string>('FRONT_URL', 'http://localhost:5173');
    this.apiUrl = config.get<string>('API_PUBLIC_URL', 'http://localhost:3000/api');
  }

  /** URL del proveedor y cookie de estado (state + PKCE), o redirección de error al front. */
  async start(provider: OAuthProvider, role: OAuthRole): Promise<{ redirectUrl: string; stateCookie?: string }> {
    const credentials = this.credentials(provider);
    if (!credentials) return { redirectUrl: this.frontCallback({ error: 'provider_not_configured' }, role) };

    const state = base64url();
    const verifier = base64url();
    const statePayload: StatePayload = { purpose: 'oauth-state', provider, role, state, verifier };
    const stateCookie = await this.jwt.signAsync(statePayload, { expiresIn: OAUTH_STATE_TTL_SECONDS });

    const redirectUrl = OAUTH_PROVIDERS[provider].authorizeUrl({
      clientId: credentials.clientId,
      redirectUri: this.redirectUri(provider),
      state,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    });
    return { redirectUrl, stateCookie };
  }

  /** Procesa la vuelta del proveedor. Siempre devuelve una URL del front (éxito o error). */
  async handleCallback(
    provider: OAuthProvider,
    query: { code?: string; state?: string; error?: string },
    stateCookie: string | undefined,
  ): Promise<string> {
    let role: OAuthRole = Role.EMPLOYEE;
    try {
      const saved = await this.verifyState(provider, query.state, stateCookie);
      role = saved.role;
      if (query.error) throw new OAuthFlowError('cancelled');
      if (!query.code) throw new OAuthFlowError('state');

      const credentials = this.credentials(provider);
      if (!credentials) throw new OAuthFlowError('provider_not_configured');

      let profile: OAuthProfile;
      try {
        profile = await OAUTH_PROVIDERS[provider].fetchProfile({
          ...credentials,
          redirectUri: this.redirectUri(provider),
          code: query.code,
          codeVerifier: saved.verifier,
        });
      } catch (e) {
        this.logger.warn(`OAuth ${provider}: ${(e as Error).message}`);
        throw new OAuthFlowError('provider');
      }
      // Solo se confía en emails verificados por el proveedor (requisito para vincular cuentas).
      if (!profile.verifiedEmail) throw new OAuthFlowError('email_not_verified');

      const result = await this.resolveUser(provider, { ...profile, verifiedEmail: profile.verifiedEmail }, role);
      if ('signupToken' in result) return this.frontCallback({ signup: result.signupToken }, role);
      return this.frontCallback({ code: this.createLoginCode(result.user.id) }, role);
    } catch (e) {
      if (e instanceof OAuthFlowError) return this.frontCallback({ error: e.code }, role);
      this.logger.error(`OAuth ${provider}: ${(e as Error).message}`);
      return this.frontCallback({ error: 'provider' }, role);
    }
  }

  errorRedirect(code: OAuthErrorCode, role: OAuthRole = Role.EMPLOYEE): string {
    return this.frontCallback({ error: code }, role);
  }

  async exchange(code: string): Promise<AccessTokenDto> {
    this.pruneLoginCodes();
    const entry = this.loginCodes.get(code);
    this.loginCodes.delete(code);
    const invalid = new UnauthorizedException('El inicio de sesión venció. Volvé a intentar.');
    if (!entry || entry.expiresAt < Date.now()) throw invalid;

    const user = await this.prisma.user.findUnique({ where: { id: entry.userId }, select: AUTH_USER_SELECT });
    if (!user || user.status === UserStatus.SUSPENDED || user.role === Role.ADMIN) throw invalid;
    return this.auth.issueAccessToken(user);
  }

  /** Paso extra del registro de empleador con Google/GitHub: crea cuenta, empresa (PENDING) y vínculo OAuth. */
  async completeEmployerSignup(dto: CompleteEmployerSignupDto): Promise<AccessTokenDto> {
    let payload: SignupPayload;
    try {
      payload = await this.jwt.verifyAsync<SignupPayload>(dto.signupToken);
    } catch {
      throw new UnauthorizedException('El registro venció. Volvé a intentar con Google o GitHub.');
    }
    if (payload.purpose !== 'oauth-signup') throw new UnauthorizedException('Token de registro inválido');

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: payload.email,
            role: Role.EMPLOYER,
            companyMembers: { create: { role: 'owner', company: { create: { name: dto.companyName } } } },
          },
          select: AUTH_USER_SELECT,
        });
        await tx.oAuthAccount.create({
          data: { userId: created.id, provider: payload.provider, providerAccountId: payload.providerAccountId },
        });
        return created;
      });
      return this.auth.issueAccessToken(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('No se pudo completar el registro. Si ya tenés cuenta, iniciá sesión.');
      }
      throw e;
    }
  }

  private async resolveUser(
    provider: OAuthProvider,
    profile: OAuthProfile & { verifiedEmail: string },
    role: OAuthRole,
  ): Promise<{ user: AuthUser } | { signupToken: string }> {
    const email = profile.verifiedEmail.trim().toLowerCase();
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
      select: { userId: true },
    });
    const user = linked
      ? await this.prisma.user.findUnique({ where: { id: linked.userId }, select: AUTH_USER_SELECT })
      : await this.prisma.user.findUnique({ where: { email }, select: AUTH_USER_SELECT });

    if (user) {
      // ADMIN siempre entra con contraseña + 2FA; nunca se vincula ni se loguea por OAuth.
      if (user.role === Role.ADMIN || user.status === UserStatus.SUSPENDED) throw new OAuthFlowError('not_allowed');
      if (!linked) {
        // Vinculación por email: el proveedor ya confirmó que el email está verificado.
        await this.prisma.oAuthAccount.create({
          data: { userId: user.id, provider, providerAccountId: profile.providerAccountId },
        });
      }
      return { user };
    }

    if (role === Role.EMPLOYER) {
      const payload: SignupPayload = {
        purpose: 'oauth-signup',
        provider,
        providerAccountId: profile.providerAccountId,
        email,
        name: profile.name,
      };
      return { signupToken: await this.jwt.signAsync(payload, { expiresIn: SIGNUP_TTL_SECONDS }) };
    }

    const fullName = (profile.name?.trim() || email.split('@')[0]).slice(0, 120);
    const created = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email, role: Role.EMPLOYEE, employeeProfile: { create: { fullName } } },
        select: AUTH_USER_SELECT,
      });
      await tx.oAuthAccount.create({
        data: { userId: newUser.id, provider, providerAccountId: profile.providerAccountId },
      });
      return newUser;
    });
    return { user: created };
  }

  private async verifyState(provider: OAuthProvider, state: string | undefined, cookie: string | undefined) {
    if (!cookie || !state) throw new OAuthFlowError('state');
    let saved: StatePayload;
    try {
      saved = await this.jwt.verifyAsync<StatePayload>(cookie);
    } catch {
      throw new OAuthFlowError('state');
    }
    if (saved.purpose !== 'oauth-state' || saved.provider !== provider || !sameString(saved.state, state)) {
      throw new OAuthFlowError('state');
    }
    return saved;
  }

  private credentials(provider: OAuthProvider) {
    const clientId = this.config.get<string>(`${provider}_CLIENT_ID`);
    const clientSecret = this.config.get<string>(`${provider}_CLIENT_SECRET`);
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }

  private redirectUri(provider: OAuthProvider) {
    return `${this.apiUrl}/auth/oauth/${provider.toLowerCase()}/callback`;
  }

  /** Los datos van en el fragmento (#), que el navegador no envía a ningún servidor. */
  private frontCallback(params: Record<string, string>, role: OAuthRole) {
    const profile = role === Role.EMPLOYER ? 'empleador' : 'empleado';
    return `${this.frontUrl}/auth/callback#${new URLSearchParams({ ...params, perfil: profile })}`;
  }

  private createLoginCode(userId: number) {
    this.pruneLoginCodes();
    const code = base64url();
    this.loginCodes.set(code, { userId, expiresAt: Date.now() + LOGIN_CODE_TTL_MS });
    return code;
  }

  private pruneLoginCodes() {
    const now = Date.now();
    for (const [code, entry] of this.loginCodes) if (entry.expiresAt < now) this.loginCodes.delete(code);
  }
}
