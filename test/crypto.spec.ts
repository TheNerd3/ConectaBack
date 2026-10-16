import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, parseEncryptionKey } from '../src/common/crypto';
import { validateEnv } from '../src/config/env.validation';

describe('crypto', () => {
  const key = randomBytes(32);

  it('cifra y descifra (AES-256-GCM) sin guardar el texto plano', () => {
    const payload = encrypt('JBSWY3DPEHPK3PXP', key);
    expect(payload).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decrypt(payload, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('falla si el payload fue alterado o la clave es otra', () => {
    const payload = encrypt('secreto', key);
    expect(() => decrypt(payload, randomBytes(32))).toThrow();
    const [iv, tag] = payload.split('.');
    expect(() => decrypt(`${iv}.${tag}.${Buffer.from('otro').toString('base64')}`, key)).toThrow();
  });

  it('acepta claves de 32 bytes en base64 o hex', () => {
    expect(parseEncryptionKey(key.toString('base64'))).toEqual(key);
    expect(parseEncryptionKey(key.toString('hex'))).toEqual(key);
  });

  it.each([undefined, '', 'cambiar-esto', randomBytes(16).toString('base64'), randomBytes(31).toString('hex')])(
    'rechaza ENCRYPTION_KEY inválida (%p)',
    (value) => {
      expect(() => parseEncryptionKey(value)).toThrow(/32 bytes/);
    },
  );
});

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://x',
    JWT_SECRET: 'x'.repeat(32),
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };

  it('acepta una configuración válida', () => {
    expect(validateEnv(valid)).toBe(valid);
  });

  it('no deja arrancar con ENCRYPTION_KEY o JWT_SECRET inválidos', () => {
    expect(() => validateEnv({ ...valid, ENCRYPTION_KEY: 'cambiar-esto' })).toThrow(/ENCRYPTION_KEY/);
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
  });
});
