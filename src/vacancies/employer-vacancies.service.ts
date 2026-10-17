import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Stage, VacancyStatus, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVacancyDto, UpdateVacancyDto } from './dto/vacancy-input.dto';
import {
  ApplicationCountsDto,
  EmployerVacanciesDto,
  EmployerVacancyDetailDto,
  EmployerVacancyDto,
} from './dto/vacancy-response.dto';
import { listedSalary } from './vacancy.mapper';

const EMPLOYER_VACANCY_SELECT = {
  id: true,
  title: true,
  modality: true,
  location: true,
  salaryMin: true,
  salaryMax: true,
  showSalary: true,
  status: true,
  createdAt: true,
  description: true,
  skills: { select: { skill: { select: { id: true, name: true } } }, orderBy: { skill: { name: 'asc' } } },
} satisfies Prisma.VacancySelect;

type EmployerVacancyRow = Prisma.VacancyGetPayload<{ select: typeof EMPLOYER_VACANCY_SELECT }>;

interface EmployerCompany {
  id: number;
  name: string;
  verificationStatus: VerificationStatus;
  transparentSeal: boolean;
  avgResponseHours: number;
}

const NOT_FOUND = 'Vacante no encontrada';

/** Gestión de vacantes de la empresa del empleador autenticado. */
@Injectable()
export class EmployerVacanciesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number): Promise<EmployerVacanciesDto> {
    const company = await this.companyOf(userId);
    const rows = await this.prisma.vacancy.findMany({
      where: { companyId: company.id },
      select: EMPLOYER_VACANCY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const counts = await this.applicationCounts(rows.map((r) => r.id));
    const items = rows.map((r) => this.toDto(r, company, counts.get(r.id)));

    return {
      company: {
        id: company.id,
        name: company.name,
        verificationStatus: company.verificationStatus,
        transparentSeal: company.transparentSeal,
        canPublish: company.verificationStatus === VerificationStatus.APPROVED,
      },
      stats: {
        activeVacancies: items.filter((v) => v.status === VacancyStatus.ACTIVE).length,
        inReview: items.reduce((sum, v) => sum + v.applications.review, 0),
        inInterview: items.reduce((sum, v) => sum + v.applications.interview, 0),
        avgResponseHours: company.avgResponseHours > 0 ? company.avgResponseHours : null,
      },
      items,
    };
  }

  async findOne(userId: number, id: number): Promise<EmployerVacancyDetailDto> {
    const company = await this.companyOf(userId);
    const row = await this.ownVacancy(company.id, id);
    const counts = await this.applicationCounts([row.id]);
    return { ...this.toDto(row, company, counts.get(row.id)), description: row.description };
  }

  async create(userId: number, dto: CreateVacancyDto): Promise<EmployerVacancyDetailDto> {
    const company = await this.approvedCompanyOf(userId);
    const salary = this.checkSalary({
      salaryMin: dto.salaryMin ?? null,
      salaryMax: dto.salaryMax ?? null,
      showSalary: dto.showSalary ?? false,
    });
    await this.checkSkills(dto.skillIds);

    const row = await this.prisma.vacancy.create({
      data: {
        companyId: company.id,
        title: dto.title,
        modality: dto.modality,
        location: dto.location,
        description: dto.description,
        ...salary,
        ...listedSalary(salary),
        skills: { create: dto.skillIds.map((skillId) => ({ skillId })) },
      },
      select: EMPLOYER_VACANCY_SELECT,
    });
    return { ...this.toDto(row, company), description: row.description };
  }

  async update(userId: number, id: number, dto: UpdateVacancyDto): Promise<EmployerVacancyDetailDto> {
    const company = await this.approvedCompanyOf(userId);
    const current = await this.ownVacancy(company.id, id);
    // undefined = no se envió (se mantiene); null = se borra.
    const salary = this.checkSalary({
      salaryMin: dto.salaryMin !== undefined ? dto.salaryMin : current.salaryMin,
      salaryMax: dto.salaryMax !== undefined ? dto.salaryMax : current.salaryMax,
      showSalary: dto.showSalary ?? current.showSalary,
    });
    if (dto.skillIds) await this.checkSkills(dto.skillIds);

    const row = await this.prisma.vacancy.update({
      where: { id },
      data: {
        title: dto.title,
        modality: dto.modality,
        location: dto.location,
        description: dto.description,
        ...salary,
        ...listedSalary(salary),
        ...(dto.skillIds && {
          skills: { deleteMany: {}, create: dto.skillIds.map((skillId) => ({ skillId })) },
        }),
      },
      select: EMPLOYER_VACANCY_SELECT,
    });
    const counts = await this.applicationCounts([row.id]);
    return { ...this.toDto(row, company, counts.get(row.id)), description: row.description };
  }

  /** Pausar (deja de verse en la búsqueda) o reactivar. */
  async setStatus(userId: number, id: number, status: VacancyStatus): Promise<EmployerVacancyDetailDto> {
    const company = await this.approvedCompanyOf(userId);
    await this.ownVacancy(company.id, id);
    const row = await this.prisma.vacancy.update({ where: { id }, data: { status }, select: EMPLOYER_VACANCY_SELECT });
    const counts = await this.applicationCounts([row.id]);
    return { ...this.toDto(row, company, counts.get(row.id)), description: row.description };
  }

  /** Empresa del empleador. Hoy el registro crea una sola por usuario; se usa la primera. */
  private async companyOf(userId: number): Promise<EmployerCompany> {
    const membership = await this.prisma.companyMember.findFirst({
      where: { userId },
      orderBy: { companyId: 'asc' },
      select: {
        company: {
          select: { id: true, name: true, verificationStatus: true, transparentSeal: true, avgResponseHours: true },
        },
      },
    });
    if (!membership) throw new ForbiddenException('Tu usuario no pertenece a ninguna empresa');
    return membership.company;
  }

  private async approvedCompanyOf(userId: number): Promise<EmployerCompany> {
    const company = await this.companyOf(userId);
    if (company.verificationStatus !== VerificationStatus.APPROVED) {
      throw new ForbiddenException(
        'Tu empresa todavía no fue verificada. Vas a poder publicar y editar vacantes cuando un administrador la apruebe.',
      );
    }
    return company;
  }

  /** Una vacante de otra empresa responde 404: no se revela que existe. */
  private async ownVacancy(companyId: number, id: number): Promise<EmployerVacancyRow> {
    const row = await this.prisma.vacancy.findFirst({ where: { id, companyId }, select: EMPLOYER_VACANCY_SELECT });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private checkSalary(s: { salaryMin: number | null; salaryMax: number | null; showSalary: boolean }) {
    if (s.salaryMin !== null && s.salaryMax !== null && s.salaryMax < s.salaryMin) {
      throw new BadRequestException('El salario "hasta" no puede ser menor que el salario "desde"');
    }
    if (s.showSalary && s.salaryMin === null && s.salaryMax === null) {
      throw new BadRequestException('Para mostrar el salario, cargá al menos un valor del rango');
    }
    return s;
  }

  private async checkSkills(skillIds: number[]) {
    const found = await this.prisma.skill.count({ where: { id: { in: skillIds } } });
    if (found !== new Set(skillIds).size) throw new BadRequestException('Alguna de las skills no existe en el catálogo');
  }

  private async applicationCounts(vacancyIds: number[]): Promise<Map<number, ApplicationCountsDto>> {
    const result = new Map<number, ApplicationCountsDto>();
    if (!vacancyIds.length) return result;
    const groups = await this.prisma.application.groupBy({
      by: ['vacancyId', 'stage'],
      where: { vacancyId: { in: vacancyIds } },
      _count: { _all: true },
    });
    for (const g of groups) {
      const c = result.get(g.vacancyId) ?? { total: 0, review: 0, interview: 0 };
      c.total += g._count._all;
      if (g.stage === Stage.REVIEW) c.review += g._count._all;
      if (g.stage === Stage.INTERVIEW) c.interview += g._count._all;
      result.set(g.vacancyId, c);
    }
    return result;
  }

  private toDto(row: EmployerVacancyRow, company: EmployerCompany, counts?: ApplicationCountsDto): EmployerVacancyDto {
    return {
      id: row.id,
      title: row.title,
      modality: row.modality,
      location: row.location,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      showSalary: row.showSalary,
      status: row.status,
      featured: company.transparentSeal,
      createdAt: row.createdAt,
      skills: row.skills.map((s) => s.skill),
      applications: counts ?? { total: 0, review: 0, interview: 0 },
    };
  }
}
