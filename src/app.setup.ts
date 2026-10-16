import { INestApplication, ValidationPipe } from '@nestjs/common';

// Configuración común a main.ts y a los tests e2e.
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.FRONT_URL ?? 'http://localhost:5173' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
