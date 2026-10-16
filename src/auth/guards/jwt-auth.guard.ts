import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser, JwtPayload } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Guard global: todo endpoint exige un access token válido salvo que tenga @Public().
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearer(request);
    if (!token) throw new UnauthorizedException('No autenticado');

    let payload: JwtPayload & { iat?: number };
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('No autenticado');
    }
    // El token intermedio del 2FA no sirve como access token.
    if (payload.purpose !== 'access') throw new UnauthorizedException('No autenticado');

    // Se relee el usuario en cada request: una suspensión corta también las sesiones abiertas.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, mascotEnabled: true, passwordChangedAt: true },
    });
    if (!user || user.status === UserStatus.SUSPENDED) throw new UnauthorizedException('No autenticado');
    // Un cambio de contraseña invalida los tokens emitidos antes.
    if (user.passwordChangedAt && (payload.iat ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      throw new UnauthorizedException('No autenticado');
    }

    const { passwordChangedAt: _, ...authUser } = user;
    request.user = authUser;
    return true;
  }
}

function extractBearer(request: RequestWithUser): string | undefined {
  const [type, token] = request.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' && token ? token : undefined;
}

interface RequestWithUser {
  headers: { authorization?: string };
  user?: AuthUser;
}
