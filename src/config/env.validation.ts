import { parseEncryptionKey } from '../common/crypto';

// Se ejecuta al arrancar (ConfigModule.validate): si falta algo crítico, la app no levanta.
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  if (!config.DATABASE_URL) errors.push('DATABASE_URL es obligatoria.');

  const jwtSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET : '';
  if (jwtSecret.length < 32) {
    errors.push(
      'JWT_SECRET debe tener al menos 32 caracteres. ' +
        `Generá uno con: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`,
    );
  }

  try {
    parseEncryptionKey(config.ENCRYPTION_KEY as string | undefined);
  } catch (e) {
    errors.push((e as Error).message);
  }

  if (errors.length) throw new Error(`Configuración inválida:\n- ${errors.join('\n- ')}`);
  return config;
}
