import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from './credentials.dto';

// En el login no se valida el largo mínimo de la contraseña: cualquier error es "Credenciales inválidas".
export class LoginDto {
  @ApiProperty({ example: 'ana@email.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresá un email válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'una-contraseña-segura' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
