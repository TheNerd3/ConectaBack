import { INestApplication, Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrisma, FakeUser } from './fake-prisma';

export const PASSWORD = 'contraseña-segura';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: FakePrisma;
  jwt: JwtService;
  mail: { send: jest.Mock };
  insertUser(role: Role, extra?: Partial<FakeUser>): Promise<FakeUser>;
  tokenFor(user: { id: number; role: Role }, purpose?: 'access' | '2fa'): Promise<string>;
}

/** App completa (guards globales incluidos) con Prisma en memoria y el envío de emails mockeado. */
export async function createTestApp(extraControllers: Type[] = []): Promise<TestApp> {
  const prisma = new FakePrisma();
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: extraControllers })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const jwt = moduleRef.get(JwtService);

  return {
    app,
    http: request(app.getHttpServer()),
    prisma,
    jwt,
    mail,
    insertUser: async (role, extra = {}) =>
      prisma.insert({ email: `${role.toLowerCase()}@test.com`, passwordHash: await argon2.hash(PASSWORD), role, ...extra }),
    tokenFor: (user, purpose = 'access') => jwt.signAsync({ sub: user.id, role: user.role, purpose }),
  };
}

/** Espera a que se cumpla una condición (para tareas en segundo plano, como el envío de emails). */
export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: tiempo agotado');
    await new Promise((r) => setTimeout(r, 10));
  }
}
