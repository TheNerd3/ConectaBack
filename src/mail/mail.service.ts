import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Envío de emails por SMTP (cualquier proveedor). En desarrollo, Mailpit (docker compose) en localhost:1025.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('MAIL_FROM', 'Conecta <no-reply@conecta.local>');
    if (!host) {
      this.transporter = null;
      this.logger.warn('SMTP_HOST no configurado: los emails no se envían');
      return;
    }
    const user = config.get<string>('SMTP_USER');
    this.transporter = createTransport({
      host,
      port: Number(config.get('SMTP_PORT', 1025)),
      secure: config.get('SMTP_SECURE') === 'true',
      auth: user ? { user, pass: config.get<string>('SMTP_PASS') } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) return;
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
