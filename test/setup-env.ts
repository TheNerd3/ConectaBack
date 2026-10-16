// Variables de entorno de los tests: no dependen del .env local ni de una DB real (Prisma se reemplaza por un fake).
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret-de-al-menos-treinta-y-dos-caracteres';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
