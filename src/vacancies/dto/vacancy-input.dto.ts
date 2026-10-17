import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Modality, VacancyStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MAX_SALARY = 1_000_000_000;

export class CreateVacancyDto {
  @ApiProperty({ example: 'Full Stack Developer', minLength: 3, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Ingresá el puesto' })
  @MaxLength(120)
  title!: string;

  @ApiProperty({ enum: Modality })
  @IsEnum(Modality, { message: 'Elegí una modalidad' })
  modality!: Modality;

  @ApiProperty({ example: 'Buenos Aires, Argentina', minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Ingresá la ubicación' })
  @MaxLength(120)
  location!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Monto mensual en AR$' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SALARY)
  salaryMin?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Monto mensual en AR$' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SALARY)
  salaryMax?: number | null;

  @ApiPropertyOptional({ default: false, description: 'Mostrar el rango públicamente en la oferta' })
  @IsOptional()
  @IsBoolean()
  showSalary?: boolean;

  @ApiProperty({ minLength: 20, maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @MinLength(20, { message: 'Contá un poco más sobre el puesto (al menos 20 caracteres)' })
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ type: [Number], description: 'Ids del catálogo de skills (1 a 15)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agregá al menos una skill' })
  @ArrayMaxSize(15)
  @ArrayUnique()
  @IsInt({ each: true })
  skillIds!: number[];
}

/** Edición: todos los campos opcionales; `null` en salario lo borra. */
export class UpdateVacancyDto extends PartialType(CreateVacancyDto) {}

export class UpdateVacancyStatusDto {
  @ApiProperty({ enum: VacancyStatus, description: 'ACTIVE (reactivar) o PAUSED (pausar)' })
  @IsEnum(VacancyStatus)
  status!: VacancyStatus;
}
