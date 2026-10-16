// Crea la cuenta ADMIN (no se puede registrar por la API) con su 2FA.
// Uso: npm run db:seed  (lee ADMIN_EMAIL, ADMIN_PASSWORD y ENCRYPTION_KEY del .env)
// Es idempotente: si el admin ya existe no lo modifica, salvo con ADMIN_RESET_2FA=true,
// que genera un secreto TOTP nuevo (por ejemplo, si se perdió el celular).
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { generateSecret, generateURI } from 'otplib';
import { encrypt, parseEncryptionKey } from '../src/common/crypto';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const resetTotp = process.env.ADMIN_RESET_2FA === 'true';
  const key = parseEncryptionKey(process.env.ENCRYPTION_KEY);

  if (!email) throw new Error('Falta ADMIN_EMAIL en el .env');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== Role.ADMIN) {
    throw new Error(`${email} ya existe con rol ${existing.role}; usá otro ADMIN_EMAIL`);
  }
  if (existing && !resetTotp) {
    console.log(`El admin ${email} ya existe; no se modificó. (ADMIN_RESET_2FA=true para regenerar el 2FA)`);
    return;
  }

  const secret = generateSecret();
  const totpSecretEncrypted = encrypt(secret, key);

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { totpSecretEncrypted } });
    console.log(`2FA regenerado para ${email}. El código anterior deja de funcionar.`);
  } else {
    await prisma.user.create({
      data: { email, passwordHash: await argon2.hash(password), role: Role.ADMIN, totpSecretEncrypted },
    });
    console.log(`Admin creado: ${email}`);
  }

  // Se muestra una sola vez: cargarlo en una app de autenticación (Google Authenticator, Authy, 1Password…).
  console.log('\nConfigurá el 2FA en tu app de autenticación (no se vuelve a mostrar):');
  console.log(`  Secreto: ${secret}`);
  console.log(`  URI:     ${generateURI({ issuer: 'Conecta', label: email, secret })}\n`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
