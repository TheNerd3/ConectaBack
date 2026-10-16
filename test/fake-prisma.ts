import { Prisma, Role, UserStatus } from '@prisma/client';

// Prisma en memoria con lo mínimo que usa el módulo auth (user.findUnique / create / update).
// Permite testear guards y flujos sin una DB real.

export interface FakeUser {
  id: number;
  email: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  mascotEnabled: boolean;
  totpSecretEncrypted: string | null;
  /** Relaciones anidadas recibidas en el create (para verificar empresa/perfil). */
  relations: Record<string, unknown>;
}

type Select = Record<string, boolean> | undefined;

function pick(user: FakeUser, select: Select) {
  if (!select) return { ...user };
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, user[k as keyof FakeUser]]));
}

export class FakePrisma {
  readonly users: FakeUser[] = [];
  private nextId = 1;

  readonly user = {
    findUnique: async ({ where, select }: { where: { id?: number; email?: string }; select?: Select }) => {
      const user = this.users.find((u) => (where.id !== undefined ? u.id === where.id : u.email === where.email));
      return user ? pick(user, select) : null;
    },
    create: async ({ data, select }: { data: Record<string, unknown>; select?: Select }) => {
      const { email, passwordHash, role, status, mascotEnabled, totpSecretEncrypted, ...relations } = data;
      if (this.users.some((u) => u.email === email)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'fake',
        });
      }
      const user: FakeUser = {
        id: this.nextId++,
        email: email as string,
        passwordHash: passwordHash as string,
        role: role as Role,
        status: (status as UserStatus) ?? UserStatus.ACTIVE,
        mascotEnabled: (mascotEnabled as boolean) ?? true,
        totpSecretEncrypted: (totpSecretEncrypted as string) ?? null,
        relations,
      };
      this.users.push(user);
      return pick(user, select);
    },
  };

  async $connect() {}
  async $disconnect() {}

  /** Inserta un usuario directamente (ej.: ADMIN, que no se registra por la API). */
  insert(data: Omit<FakeUser, 'id' | 'relations' | 'status' | 'mascotEnabled' | 'totpSecretEncrypted'> & Partial<FakeUser>) {
    const user: FakeUser = {
      status: UserStatus.ACTIVE,
      mascotEnabled: true,
      totpSecretEncrypted: null,
      relations: {},
      ...data,
      id: this.nextId++,
    };
    this.users.push(user);
    return user;
  }
}
