import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsJWT, Matches } from 'class-validator';

export class Verify2faDto {
  @ApiProperty({ description: 'Token intermedio devuelto por POST /auth/login (vence en 5 minutos)' })
  @IsJWT()
  challengeToken!: string;

  @ApiProperty({ example: '123456', description: 'Código de 6 dígitos de la app de autenticación' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value))
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}
