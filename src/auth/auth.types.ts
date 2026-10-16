import { Role, UserStatus } from '@prisma/client';

/**
 * `purpose` distingue el access token del token intermedio del 2FA:
 * el JwtAuthGuard solo acepta `access`, y POST /auth/login/2fa solo acepta `2fa`.
 */
export type TokenPurpose = 'access' | '2fa';

export interface JwtPayload {
  sub: number;
  role: Role;
  purpose: TokenPurpose;
}

/** Usuario autenticado que el guard deja en `request.user`. Nunca incluye passwordHash ni secretos. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  status: UserStatus;
  mascotEnabled: boolean;
}
