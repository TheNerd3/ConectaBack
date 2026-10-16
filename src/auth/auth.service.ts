import { ConflictException, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { verify as verifyTotp } from 'otplib';
import { decrypt, parseEncryptionKey } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth.types';
import { AccessTokenDto, AuthUserDto, LoginResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { RegisterEmployerDto } from './dto/register-employer.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';

const INVALID_CREDENTIALS = 'Credenciales inválidas';
const INVALID_2FA = 'Código inválido o vencido';
const CHALLENGE_EXPIRES_IN_SECONDS = 5 * 60;
// Tolerancia de ±30 s (un paso TOTP) por desfase de reloj del celular.
const TOTP_EPOCH_TOLERANCE = 30;

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  mascotEnabled: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly encryptionKey: Buffer;
  /** Hash señuelo: si el email no existe se verifica igual, para no revelarlo por el tiempo de respuesta. */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.encryptionKey = parseEncryptionKey(config.get<string>('ENCRYPTION_KEY'));
  }

  async onModuleInit() {
    this.dummyHash = await argon2.hash(randomBytes(16).toString('hex'));
  }

  async registerEmployee(dto: RegisterEmployeeDto): Promise<AccessTokenDto> {
    const user = await this.createUser(dto, Role.EMPLOYEE, {
      employeeProfile: { create: { fullName: dto.fullName } },
    });
    return this.issueAccessToken(user);
  }

  /** Crea el usuario EMPLOYER, su empresa (PENDING hasta que la verifique un ADMIN) y la membresía owner. */
  async registerEmployer(dto: RegisterEmployerDto): Promise<AccessTokenDto> {
    const user = await this.createUser(dto, Role.EMPLOYER, {
      companyMembers: { create: { role: 'owner', company: { create: { name: dto.companyName } } } },
    });
    return this.issueAccessToken(user);
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...AUTH_USER_SELECT, passwordHash: true, totpSecretEncrypted: true },
    });

    const passwordOk = await argon2.verify(user?.passwordHash ?? this.dummyHash, dto.password);
    // Mismo error para email inexistente, contraseña incorrecta y cuenta suspendida.
    if (!user || !passwordOk || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.role === Role.ADMIN) {
      if (!user.totpSecretEncrypted) {
        this.logger.warn(`ADMIN ${user.id} sin 2FA configurado: correr el seed`);
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }
      const challengeToken = await this.sign(user, '2fa', CHALLENGE_EXPIRES_IN_SECONDS);
      return { requires2fa: true, challengeToken };
    }

    return this.issueAccessToken(user);
  }

  async verify2fa(dto: Verify2faDto): Promise<AccessTokenDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(dto.challengeToken);
    } catch {
      throw new UnauthorizedException(INVALID_2FA);
    }
    if (payload.purpose !== '2fa') throw new UnauthorizedException(INVALID_2FA);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { ...AUTH_USER_SELECT, totpSecretEncrypted: true },
    });
    if (!user || user.role !== Role.ADMIN || user.status === UserStatus.SUSPENDED || !user.totpSecretEncrypted) {
      throw new UnauthorizedException(INVALID_2FA);
    }

    const secret = decrypt(user.totpSecretEncrypted, this.encryptionKey);
    const result = await verifyTotp({ secret, token: dto.code, epochTolerance: TOTP_EPOCH_TOLERANCE });
    if (!result.valid) throw new UnauthorizedException(INVALID_2FA);

    return this.issueAccessToken(user);
  }

  async me(userId: number): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: AUTH_USER_SELECT });
    if (!user) throw new UnauthorizedException('No autenticado');
    return user;
  }

  private async createUser(
    dto: { email: string; password: string },
    role: Role,
    relations: Pick<Prisma.UserCreateInput, 'employeeProfile' | 'companyMembers'>,
  ): Promise<AuthUser> {
    const passwordHash = await argon2.hash(dto.password);
    try {
      // Un único create anidado: Prisma lo ejecuta en una transacción.
      return await this.prisma.user.create({
        data: { email: dto.email, passwordHash, role, ...relations },
        select: AUTH_USER_SELECT,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('No se pudo completar el registro. Si ya tenés cuenta, iniciá sesión.');
      }
      throw e;
    }
  }

  private async issueAccessToken(user: Pick<AuthUser, 'id' | 'role'>): Promise<AccessTokenDto> {
    return { accessToken: await this.sign(user, 'access') };
  }

  private sign(user: Pick<AuthUser, 'id' | 'role'>, purpose: JwtPayload['purpose'], expiresIn?: number) {
    const payload: JwtPayload = { sub: user.id, role: user.role, purpose };
    return this.jwt.signAsync(payload, expiresIn ? { expiresIn } : undefined);
  }
}
