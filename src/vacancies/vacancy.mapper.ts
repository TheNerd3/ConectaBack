import { Prisma, VerificationStatus } from '@prisma/client';
import { SalaryRangeDto, VacancyCompanyDto, VacancyListItemDto } from './dto/vacancy-response.dto';

// Campos que se leen de la DB para la vista pública. El salario se lee para poder decidir,
// pero solo se expone si showSalary = true (ver toPublicSalary).
export const PUBLIC_VACANCY_SELECT = {
  id: true,
  title: true,
  modality: true,
  location: true,
  salaryMin: true,
  salaryMax: true,
  showSalary: true,
  createdAt: true,
  company: {
    select: {
      id: true,
      name: true,
      logoUrl: true,
      verificationStatus: true,
      transparentSeal: true,
      avgResponseHours: true,
    },
  },
  skills: { select: { skill: { select: { id: true, name: true } } }, orderBy: { skill: { name: 'asc' } } },
} satisfies Prisma.VacancySelect;

type PublicVacancyRow = Prisma.VacancyGetPayload<{ select: typeof PUBLIC_VACANCY_SELECT }>;

export function toPublicSalary(v: {
  showSalary: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
}): SalaryRangeDto | null {
  if (!v.showSalary || (v.salaryMin === null && v.salaryMax === null)) return null;
  return { min: v.salaryMin, max: v.salaryMax, currency: 'ARS' };
}

/** Rango visible que se guarda en listedSalaryMin/Max (null si el salario está oculto). */
export function listedSalary(v: { showSalary: boolean; salaryMin: number | null; salaryMax: number | null }) {
  return v.showSalary
    ? { listedSalaryMin: v.salaryMin, listedSalaryMax: v.salaryMax }
    : { listedSalaryMin: null, listedSalaryMax: null };
}

function toCompany(c: PublicVacancyRow['company']): VacancyCompanyDto {
  return {
    id: c.id,
    name: c.name,
    logoUrl: c.logoUrl,
    verified: c.verificationStatus === VerificationStatus.APPROVED,
    transparentSeal: c.transparentSeal,
    // 0 es el valor por defecto: todavía no hay datos de respuesta.
    avgResponseHours: c.avgResponseHours > 0 ? c.avgResponseHours : null,
  };
}

export function toListItem(v: PublicVacancyRow): VacancyListItemDto {
  return {
    id: v.id,
    title: v.title,
    modality: v.modality,
    location: v.location,
    salary: toPublicSalary(v),
    featured: v.company.transparentSeal,
    createdAt: v.createdAt,
    company: toCompany(v.company),
    skills: v.skills.map((s) => s.skill),
  };
}
