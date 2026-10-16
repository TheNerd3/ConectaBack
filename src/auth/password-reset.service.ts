import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_USER_SELECT, AuthService } from './auth.service';
import { AccessTokenDto } from './dto/auth-response.dto';

const RESET_TTL_MS = 30 * 60 * 1000;
const INVALID_RESET = 'El link para restablecer la contraseña es inválido o venció. Pedí uno nuevo.';

export const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

// "Olvidé mi contraseña" para EMPLOYEE y EMPLOYER. El ADMIN cambia su contraseña con el seed.
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly frontUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.frontUrl = config.get<string>('FRONT_URL', 'http://localhost:5173');
  }

  /**
   * Corre en segundo plano y la respuesta HTTP es siempre la misma: ni el contenido
   * ni el tiempo de respuesta revelan si el email está registrado.
   */
  requestReset(email: string): void {
    this.sendResetEmail(email).catch((e: Error) =>
      this.logger.error(`No se pudo procesar la recuperación de contraseña: ${e.message}`),
    );
  }

  async reset(token: string, password: string): Promise<AccessTokenDto> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(INVALID_RESET);
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId }, select: AUTH_USER_SELECT });
    if (!user || user.role === Role.ADMIN || user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException(INVALID_RESET);
    }

    const passwordHash = await argon2.hash(password);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Marcar como usado con condición: si dos requests usan el mismo token a la vez, solo uno gana.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count !== 1) throw new BadRequestException(INVALID_RESET);
      // passwordChangedAt invalida los access tokens emitidos antes (ver JwtAuthGuard).
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: now } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    });

    return this.auth.issueAccessToken(user);
  }

  private async sendResetEmail(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, role: true, status: true } });
    if (!user || user.role === Role.ADMIN || user.status === UserStatus.SUSPENDED) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Un solo link vigente por usuario.
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      }),
    ]);

    // El token va en el fragmento (#): no llega a los logs del servidor que sirve el front.
    const link = `${this.frontUrl}/restablecer-contrasena#token=${token}`;
    await this.mail.send({
      to: email,
      subject: 'Restablecé tu contraseña de Conecta',
      text:
        `Hola,\n\nRecibimos un pedido para restablecer la contraseña de tu cuenta de Conecta.\n` +
        `Entrá a este link para elegir una nueva (vence en 30 minutos):\n\n${link}\n\n` +
        `Si no fuiste vos, ignorá este email: tu contraseña no cambia.`,
      html:
        `<p>Hola,</p><p>Recibimos un pedido para restablecer la contraseña de tu cuenta de Conecta.</p>` +
        `<p><a href="${link}">Elegí una contraseña nueva</a> (el link vence en 30 minutos).</p>` +
        `<p>Si no fuiste vos, ignorá este email: tu contraseña no cambia.</p>`,
    });
  }
}
