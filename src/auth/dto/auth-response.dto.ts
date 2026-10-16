import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, UserStatus } from '@prisma/client';

export class AccessTokenDto {
  @ApiProperty({ description: 'JWT de acceso. Enviar como `Authorization: Bearer <token>`.' })
  accessToken!: string;
}

/** Respuesta del login: access token, o (solo ADMIN) el token intermedio para el segundo paso. */
export class LoginResponseDto {
  @ApiPropertyOptional({ description: 'Presente si el login terminó (EMPLOYEE / EMPLOYER).' })
  accessToken?: string;

  @ApiPropertyOptional({ description: 'true si hace falta el código 2FA (ADMIN).' })
  requires2fa?: boolean;

  @ApiPropertyOptional({ description: 'Token intermedio para POST /auth/login/2fa. No sirve como access token.' })
  challengeToken?: string;
}

/** Usuario autenticado. Nunca incluye passwordHash ni el secreto TOTP. */
export class AuthUserDto {
  @ApiProperty() id!: number;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty() mascotEnabled!: boolean;
}
