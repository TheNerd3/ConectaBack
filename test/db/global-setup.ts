import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-database-url';

// Crea la base de test si no existe y aplica las migraciones pendientes (no borra nada:
// cada test vacía las tablas con resetDatabase).
export default function globalSetup() {
  const url = testDatabaseUrl();
  process.env.TEST_DATABASE_URL = url;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
