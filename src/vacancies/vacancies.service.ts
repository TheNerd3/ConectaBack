import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VacancyStatus, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchVacanciesQueryDto } from './dto/search-vacancies.query';
import { VacancyDetailDto, VacancyPageDto } from './dto/vacancy-response.dto';
import { PUBLIC_VACANCY_SELECT, toListItem } from './vacancy.mapper';

// Solo se publican vacantes activas de empresas verificadas.
const VISIBLE: Prisma.VacancyWhereInput = {
  status: VacancyStatus.ACTIVE,
  company: { verificationStatus: VerificationStatus.APPROVED },
};

/** Búsqueda y detalle de vacantes para el empleado. */
@Injectable()
export class VacanciesService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchVacanciesQueryDto): Promise<VacancyPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const where = this.buildWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vacancy.count({ where }),
      this.prisma.vacancy.findMany({
        where,
        select: PUBLIC_VACANCY_SELECT,
        orderBy: this.buildOrderBy(query.sort ?? 'recent'),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(toListItem),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: number): Promise<VacancyDetailDto> {
    const row = await this.prisma.vacancy.findFirst({
      where: { id, ...VISIBLE },
      select: { ...PUBLIC_VACANCY_SELECT, description: true },
    });
    if (!row) throw new NotFoundException('Vacante no encontrada');
    return { ...toListItem(row), description: row.description };
  }

  private buildWhere(q: SearchVacanciesQueryDto): Prisma.VacancyWhereInput {
    const and: Prisma.VacancyWhereInput[] = [VISIBLE];
    const contains = (value: string) => ({ contains: value, mode: Prisma.QueryMode.insensitive });

    if (q.q) {
      and.push({
        OR: [
          { title: contains(q.q) },
          { description: contains(q.q) },
          { company: { name: contains(q.q) } },
          { skills: { some: { skill: { name: contains(q.q) } } } },
        ],
      });
    }
    if (q.modality?.length) and.push({ modality: { in: q.modality } });
    if (q.location) and.push({ location: contains(q.location) });
    // La vacante tiene que pedir todas las skills elegidas.
    for (const skillId of q.skillIds ?? []) and.push({ skills: { some: { skillId } } });

    // Salario: solo sobre el rango visible (listedSalary*). Un rango abierto ("desde X") cuenta como sin tope.
    if (q.salaryMin !== undefined) {
      and.push({
        OR: [
          { listedSalaryMax: { gte: q.salaryMin } },
          { listedSalaryMax: null, listedSalaryMin: { not: null } },
        ],
      });
    }
    if (q.salaryMax !== undefined) {
      and.push({
        OR: [
          { listedSalaryMin: { lte: q.salaryMax } },
          { listedSalaryMin: null, listedSalaryMax: { not: null } },
        ],
      });
    }
    return { AND: and };
  }

  /** Destacadas (sello Transparente) primero; el resto nunca se oculta, solo va después. */
  private buildOrderBy(sort: 'recent' | 'salary'): Prisma.VacancyOrderByWithRelationInput[] {
    const featuredFirst = { company: { transparentSeal: Prisma.SortOrder.desc } };
    const tieBreak = [{ createdAt: Prisma.SortOrder.desc }, { id: Prisma.SortOrder.desc }];
    if (sort === 'salary') {
      // Las de salario oculto (null) van al final, ordenadas por fecha: su salario real no influye.
      return [
        featuredFirst,
        { listedSalaryMax: { sort: Prisma.SortOrder.desc, nulls: 'last' } },
        { listedSalaryMin: { sort: Prisma.SortOrder.desc, nulls: 'last' } },
        ...tieBreak,
      ];
    }
    return [featuredFirst, ...tieBreak];
  }
}
