import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

// Módulos de dominio a agregar: auth, users, employees, companies, vacancies,
// applications, cv, notifications, chat, admin.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
