import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { MailService } from '../../src/mail/mail.service';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface DbTestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  tokenFor(user: { id: number; role: Role }): Promise<string>;
}

/** App completa contra la base de test real (Postgres). Los emails se mockean. */
export async function createDbApp(): Promise<DbTestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({ send: jest.fn().mockResolvedValue(undefined) })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const jwt = moduleRef.get(JwtService);
  return {
    app,
    http: request(app.getHttpServer()),
    prisma: moduleRef.get(PrismaService),
    tokenFor: (user) => jwt.signAsync({ sub: user.id, role: user.role, purpose: 'access' }),
  };
}

/** Vacía todas las tablas (menos el historial de migraciones). */
export async function resetDatabase(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
