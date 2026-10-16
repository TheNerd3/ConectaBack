import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CredentialsDto } from './credentials.dto';

export class RegisterEmployeeDto extends CredentialsDto {
  @ApiProperty({ example: 'Ana Pérez', minLength: 2, maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Ingresá tu nombre completo' })
  @MaxLength(120)
  fullName!: string;
}
