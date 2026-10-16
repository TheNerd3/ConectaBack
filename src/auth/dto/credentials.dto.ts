import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Email y contraseña, compartidos por login y registro. */
export class CredentialsDto {
  @ApiProperty({ example: 'ana@email.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresá un email válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'una-contraseña-segura', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128)
  password!: string;
}
