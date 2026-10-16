import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Guard global que corre después de JwtAuthGuard. Denegar por defecto:
// un endpoint que no declara @Roles(...) (ni @Public()) devuelve 403.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!roles?.length || !user || !roles.includes(user.role)) {
      throw new ForbiddenException('No tenés permiso para acceder a este recurso');
    }
    return true;
  }
}
