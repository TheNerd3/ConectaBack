import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Modality, VacancyStatus, VerificationStatus } from '@prisma/client';
import { SkillDto } from '../../skills/dto/skill.dto';

export class SalaryRangeDto {
  @ApiProperty({ nullable: true, type: Number }) min!: number | null;
  @ApiProperty({ nullable: true, type: Number }) max!: number | null;
  @ApiProperty({ example: 'ARS' }) currency!: 'ARS';
}

export class VacancyCompanyDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({ description: 'Empresa verificada por un ADMIN' }) verified!: boolean;
  @ApiProperty({ description: 'Sello "Empresa Transparente"' }) transparentSeal!: boolean;
  @ApiProperty({ nullable: true, type: Number, description: 'Promedio de respuesta en horas; null si no hay datos' })
  avgResponseHours!: number | null;
}

/** Vacante pública (lado empleado). Sin matchPercent todavía: se calcula cuando haya CV. */
export class VacancyListItemDto {
  @ApiProperty() id!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: Modality }) modality!: Modality;
  @ApiProperty() location!: string;
  @ApiProperty({ type: SalaryRangeDto, nullable: true, description: 'null si la empresa no lo muestra' })
  salary!: SalaryRangeDto | null;
  @ApiProperty({ description: 'Empresa con sello Transparente: se lista primero' }) featured!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: VacancyCompanyDto }) company!: VacancyCompanyDto;
  @ApiProperty({ type: [SkillDto] }) skills!: SkillDto[];
}

export class VacancyDetailDto extends VacancyListItemDto {
  @ApiProperty() description!: string;
}

export class VacancyPageDto {
  @ApiProperty({ type: [VacancyListItemDto] }) items!: VacancyListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}

// ── Lado empleador ──

export class ApplicationCountsDto {
  @ApiProperty() total!: number;
  @ApiProperty() review!: number;
  @ApiProperty() interview!: number;
}

/** Vacante propia: incluye el salario aunque esté oculto al público. */
export class EmployerVacancyDto {
  @ApiProperty() id!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: Modality }) modality!: Modality;
  @ApiProperty() location!: string;
  @ApiProperty({ nullable: true, type: Number }) salaryMin!: number | null;
  @ApiProperty({ nullable: true, type: Number }) salaryMax!: number | null;
  @ApiProperty() showSalary!: boolean;
  @ApiProperty({ enum: VacancyStatus }) status!: VacancyStatus;
  @ApiProperty() featured!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [SkillDto] }) skills!: SkillDto[];
  @ApiProperty({ type: ApplicationCountsDto }) applications!: ApplicationCountsDto;
}

export class EmployerVacancyDetailDto extends EmployerVacancyDto {
  @ApiProperty() description!: string;
}

export class EmployerCompanyDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: VerificationStatus }) verificationStatus!: VerificationStatus;
  @ApiProperty() transparentSeal!: boolean;
  @ApiProperty({ description: 'Solo una empresa APPROVED puede publicar' }) canPublish!: boolean;
}

export class EmployerVacancyStatsDto {
  @ApiProperty() activeVacancies!: number;
  @ApiProperty() inReview!: number;
  @ApiProperty() inInterview!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) avgResponseHours!: number | null;
}

export class EmployerVacanciesDto {
  @ApiProperty({ type: EmployerCompanyDto }) company!: EmployerCompanyDto;
  @ApiProperty({ type: EmployerVacancyStatsDto }) stats!: EmployerVacancyStatsDto;
  @ApiProperty({ type: [EmployerVacancyDto] }) items!: EmployerVacancyDto[];
}
