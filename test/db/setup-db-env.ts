// Mismas variables que los tests unitarios, pero apuntando a la base de test real.
import '../setup-env';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
