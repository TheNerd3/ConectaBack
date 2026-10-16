import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CredentialsDto } from './credentials.dto';

export class RegisterEmployerDto extends CredentialsDto {
  @ApiProperty({ example: 'Acme S.A.', minLength: 2, maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Ingresá el nombre de la empresa' })
  @MaxLength(120)
  companyName!: string;
}
