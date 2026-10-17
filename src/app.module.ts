import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { SkillsModule } from './skills/skills.module';
import { VacanciesModule } from './vacancies/vacancies.module';

// Módulos de dominio a agregar: users, employees, companies,
// applications, cv, notifications, chat, admin.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, AuthModule, SkillsModule, VacanciesModule],
  controllers: [HealthController],
})
export class AppModule {}
