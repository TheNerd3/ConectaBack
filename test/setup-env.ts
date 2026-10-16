// Variables de entorno de los tests: no dependen del .env local ni de una DB real (Prisma se reemplaza por un fake).
// Las vacías ('') pisan cualquier valor del .env local.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret-de-al-menos-treinta-y-dos-caracteres';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.FRONT_URL = 'http://front.test';
process.env.API_PUBLIC_URL = 'http://api.test/api';
// Google configurado y GitHub no, para probar ambos casos.
process.env.GOOGLE_CLIENT_ID = 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
process.env.GITHUB_CLIENT_ID = '';
process.env.GITHUB_CLIENT_SECRET = '';
process.env.SMTP_HOST = '';
