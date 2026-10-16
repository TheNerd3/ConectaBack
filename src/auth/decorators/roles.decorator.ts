import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Roles que pueden usar el endpoint. Un endpoint sin `@Public()` ni `@Roles(...)` se deniega. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
