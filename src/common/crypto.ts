import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Cifrado simétrico AES-256-GCM para secretos guardados en la DB
// (User.totpSecretEncrypted y, más adelante, Integration.encryptedToken).
// Formato guardado: base64(iv).base64(authTag).base64(ciphertext)

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Acepta 32 bytes en hex (64 caracteres) o en base64. Lanza un error claro si no son 32 bytes. */
export function parseEncryptionKey(raw: string | undefined): Buffer {
  const value = raw?.trim() ?? '';
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === KEY_BYTES && decoded.toString('base64') === value) return decoded;
  throw new Error(
    'ENCRYPTION_KEY debe ser una clave de 32 bytes en base64 o hex. ' +
      `Generá una con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
  );
}

export function encrypt(plainText: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string, key: Buffer): string {
  const [iv, tag, data] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
  if (!iv || !tag || !data) throw new Error('Payload cifrado con formato inválido');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
