import { ApiPropertyOptional } from '@nestjs/swagger';
import { Modality } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Acepta `?x=a&x=b` y `?x=a,b`. */
const toArray = ({ value }: { value: unknown }) => {
  if (value === undefined || value === '') return undefined;
  const list = (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(','));
  return list.map((v) => v.trim()).filter(Boolean);
};

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

export const VACANCY_SORTS = ['recent', 'salary'] as const;
export type VacancySort = (typeof VACANCY_SORTS)[number];

export class SearchVacanciesQueryDto {
  @ApiPropertyOptional({ description: 'Texto en puesto, descripción, empresa o skills' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: Modality, isArray: true, description: 'Una o varias: REMOTE,HYBRID' })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(Modality, { each: true })
  modality?: Modality[];

  @ApiPropertyOptional({ description: 'Ubicación (contiene el texto)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ type: [Number], description: 'La vacante debe pedir todas estas skills' })
  @IsOptional()
  @Transform((params) => toArray(params)?.map(Number))
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  skillIds?: number[];

  @ApiPropertyOptional({ description: 'Salario mínimo buscado (solo vacantes con salario visible)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ description: 'Salario máximo buscado (solo vacantes con salario visible)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional({ enum: VACANCY_SORTS, default: 'recent' })
  @IsOptional()
  @IsIn(VACANCY_SORTS)
  sort?: VacancySort;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
