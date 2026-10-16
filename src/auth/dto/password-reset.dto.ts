import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from './credentials.dto';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ana@email.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresá un email válido' })
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recibido por email' })
  @IsString()
  @Length(20, 200)
  token!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128)
  password!: string;
}

export class MessageDto {
  @ApiProperty() message!: string;
}
