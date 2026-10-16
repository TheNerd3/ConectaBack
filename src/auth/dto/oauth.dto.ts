import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsJWT, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export const OAUTH_ROLES = [Role.EMPLOYEE, Role.EMPLOYER] as const;
export type OAuthRole = (typeof OAUTH_ROLES)[number];

export class OAuthStartQueryDto {
  @ApiPropertyOptional({ enum: OAUTH_ROLES, default: Role.EMPLOYEE, description: 'Rol para una cuenta nueva' })
  @IsOptional()
  @IsIn(OAUTH_ROLES)
  role?: OAuthRole;
}

export class OAuthExchangeDto {
  @ApiProperty({ description: 'Código de un solo uso que el callback deja en la URL del front (vence en 60 s)' })
  @IsString()
  @Length(20, 100)
  code!: string;
}

export class CompleteEmployerSignupDto {
  @ApiProperty({ description: 'Token de registro pendiente que el callback deja en la URL del front (vence en 15 min)' })
  @IsJWT()
  signupToken!: string;

  @ApiProperty({ example: 'Acme S.A.', minLength: 2, maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Ingresá el nombre de la empresa' })
  @MaxLength(120)
  companyName!: string;
}
