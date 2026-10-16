import { OAuthProvider, Prisma, Role, UserStatus } from '@prisma/client';

// Prisma en memoria con lo mínimo que usa el módulo auth. Permite testear guards y flujos sin una DB real.

export interface FakeUser {
  id: number;
  email: string;
  passwordHash: string | null;
  role: Role;
  status: UserStatus;
  mascotEnabled: boolean;
  totpSecretEncrypted: string | null;
  passwordChangedAt: Date | null;
  /** Relaciones anidadas recibidas en el create (para verificar empresa/perfil). */
  relations: Record<string, unknown>;
}

export interface FakeOAuthAccount {
  id: number;
  userId: number;
  provider: OAuthProvider;
  providerAccountId: string;
}

export interface FakeResetToken {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

type Select = Record<string, boolean> | undefined;

function pick<T extends object>(row: T, select: Select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k as keyof T]]));
}

const uniqueError = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'fake' });

export class FakePrisma {
  readonly users: FakeUser[] = [];
  readonly oauthAccounts: FakeOAuthAccount[] = [];
  readonly resetTokens: FakeResetToken[] = [];
  private nextId = 1;

  readonly user = {
    findUnique: async ({ where, select }: { where: { id?: number; email?: string }; select?: Select }) => {
      const user = this.users.find((u) => (where.id !== undefined ? u.id === where.id : u.email === where.email));
      return user ? pick(user, select) : null;
    },
    create: async ({ data, select }: { data: Record<string, unknown>; select?: Select }) => {
      const { email, passwordHash, role, status, mascotEnabled, totpSecretEncrypted, ...relations } = data;
      if (this.users.some((u) => u.email === email)) throw uniqueError();
      const user: FakeUser = {
        id: this.nextId++,
        email: email as string,
        passwordHash: (passwordHash as string) ?? null,
        role: role as Role,
        status: (status as UserStatus) ?? UserStatus.ACTIVE,
        mascotEnabled: (mascotEnabled as boolean) ?? true,
        totpSecretEncrypted: (totpSecretEncrypted as string) ?? null,
        passwordChangedAt: null,
        relations,
      };
      this.users.push(user);
      return pick(user, select);
    },
    update: async ({ where, data }: { where: { id: number }; data: Partial<FakeUser> }) => {
      const user = this.users.find((u) => u.id === where.id);
      if (!user) throw new Error('not found');
      Object.assign(user, data);
      return { ...user };
    },
  };

  readonly oAuthAccount = {
    findUnique: async ({
      where,
      select,
    }: {
      where: { provider_providerAccountId: { provider: OAuthProvider; providerAccountId: string } };
      select?: Select;
    }) => {
      const { provider, providerAccountId } = where.provider_providerAccountId;
      const row = this.oauthAccounts.find((a) => a.provider === provider && a.providerAccountId === providerAccountId);
      return row ? pick(row, select) : null;
    },
    create: async ({ data }: { data: Omit<FakeOAuthAccount, 'id'> }) => {
      if (this.oauthAccounts.some((a) => a.provider === data.provider && a.providerAccountId === data.providerAccountId)) {
        throw uniqueError();
      }
      const row = { id: this.nextId++, ...data };
      this.oauthAccounts.push(row);
      return row;
    },
  };

  readonly passwordResetToken = {
    findUnique: async ({ where, select }: { where: { tokenHash: string }; select?: Select }) => {
      const row = this.resetTokens.find((t) => t.tokenHash === where.tokenHash);
      return row ? pick(row, select) : null;
    },
    create: async ({ data }: { data: Omit<FakeResetToken, 'id' | 'usedAt'> }) => {
      const row: FakeResetToken = { id: this.nextId++, usedAt: null, ...data };
      this.resetTokens.push(row);
      return row;
    },
    deleteMany: async ({ where }: { where: { userId: number; usedAt: null } }) => {
      const before = this.resetTokens.length;
      for (let i = this.resetTokens.length - 1; i >= 0; i--) {
        const t = this.resetTokens[i];
        if (t.userId === where.userId && t.usedAt === null) this.resetTokens.splice(i, 1);
      }
      return { count: before - this.resetTokens.length };
    },
    updateMany: async ({ where, data }: { where: { id: number; usedAt: null }; data: { usedAt: Date } }) => {
      const rows = this.resetTokens.filter((t) => t.id === where.id && t.usedAt === null);
      rows.forEach((t) => Object.assign(t, data));
      return { count: rows.length };
    },
  };

  /** Sin rollback real: alcanza para los flujos testeados. */
  async $transaction(arg: unknown): Promise<unknown> {
    if (typeof arg === 'function') return arg(this);
    return Promise.all(arg as Promise<unknown>[]);
  }

  async $connect() {}
  async $disconnect() {}

  /** Inserta un usuario directamente (ej.: ADMIN, que no se registra por la API). */
  insert(
    data: Pick<FakeUser, 'email' | 'role'> & Partial<Omit<FakeUser, 'id' | 'email' | 'role'>>,
  ): FakeUser {
    const user: FakeUser = {
      passwordHash: null,
      status: UserStatus.ACTIVE,
      mascotEnabled: true,
      totpSecretEncrypted: null,
      passwordChangedAt: null,
      relations: {},
      ...data,
      id: this.nextId++,
    };
    this.users.push(user);
    return user;
  }
}
