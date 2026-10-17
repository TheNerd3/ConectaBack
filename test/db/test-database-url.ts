// URL de la base de test: TEST_DATABASE_URL, o la de DATABASE_URL (.env) con la base "conecta_test".
// Por seguridad, el nombre de la base tiene que terminar en "_test": los tests la vacían.
export function testDatabaseUrl(): string {
  let raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    try {
      process.loadEnvFile('.env');
    } catch {
      // sin .env: se usa lo que haya en el entorno
    }
    if (!process.env.DATABASE_URL) throw new Error('Definí TEST_DATABASE_URL o DATABASE_URL para correr test:db');
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/conecta_test';
    raw = url.toString();
  }
  const dbName = new URL(raw).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`La base de test tiene que terminar en "_test" (se recibió "${dbName}"): los tests la vacían`);
  }
  return raw;
}
