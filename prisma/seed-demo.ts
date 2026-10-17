// Datos de demo: skills, 3 empresas verificadas, 12 vacantes y usuarios de prueba.
// Uso: npm run db:seed:demo  (lee DEMO_PASSWORD del .env). Es idempotente: se puede correr varias veces.
// La cuenta ADMIN (con 2FA) se crea aparte con `npm run db:seed`.
import { Modality, PrismaClient, Role, VacancyStatus, VerificationStatus } from '@prisma/client';
import * as argon2 from 'argon2';

try {
  process.loadEnvFile('.env');
} catch {
  // sin .env: se usan las variables del entorno
}

const prisma = new PrismaClient();

const SKILLS = [
  'React', 'TypeScript', 'JavaScript', 'Node.js', 'NestJS', 'Next.js', 'Vue.js', 'Angular', 'Python',
  'Django', 'Java', 'Spring Boot', 'Go', 'PostgreSQL', 'MySQL', 'MongoDB', 'Docker', 'Kubernetes', 'AWS',
  'Git', 'CI/CD', 'Testing automatizado', 'Figma', 'Scrum', 'Inglés',
];

interface DemoVacancy {
  title: string;
  modality: Modality;
  location: string;
  salary?: [number | null, number | null];
  showSalary?: boolean;
  status?: VacancyStatus;
  daysAgo: number;
  skills: string[];
  description: string;
}

interface DemoCompany {
  name: string;
  employerEmail: string;
  transparentSeal: boolean;
  vacancies: DemoVacancy[];
}

const COMPANIES: DemoCompany[] = [
  {
    name: 'Nimbus Software',
    employerEmail: 'rrhh@nimbus.demo',
    transparentSeal: true,
    vacancies: [
      {
        title: 'Desarrolladora/or Frontend React',
        modality: Modality.REMOTE,
        location: 'Córdoba, AR',
        salary: [1_400_000, 1_800_000],
        showSalary: true,
        daysAgo: 2,
        skills: ['React', 'TypeScript', 'Git', 'Testing automatizado'],
        description:
          'Sumate al equipo que construye el panel de clientes de Nimbus. Vas a trabajar con React y TypeScript, ' +
          'con revisión de código entre pares y despliegues continuos. Cada postulación la lee una persona del equipo técnico.',
      },
      {
        title: 'Backend Developer Node.js',
        modality: Modality.HYBRID,
        location: 'Córdoba, AR',
        salary: [1_600_000, 2_100_000],
        showSalary: true,
        daysAgo: 6,
        skills: ['Node.js', 'NestJS', 'PostgreSQL', 'Docker'],
        description:
          'Buscamos a alguien para diseñar y mantener APIs en NestJS sobre PostgreSQL. Dos días por semana en la ' +
          'oficina de Nueva Córdoba. Valoramos experiencia con colas de mensajes y observabilidad.',
      },
      {
        title: 'QA Automation Engineer',
        modality: Modality.REMOTE,
        location: 'Argentina',
        salary: [1_300_000, 1_650_000],
        showSalary: false,
        daysAgo: 12,
        skills: ['Testing automatizado', 'JavaScript', 'CI/CD'],
        description:
          'Vas a liderar la automatización de pruebas end-to-end y su integración en el pipeline de CI. ' +
          'Trabajo 100 % remoto dentro de Argentina, con horario flexible.',
      },
      {
        title: 'Product Designer',
        modality: Modality.HYBRID,
        location: 'Buenos Aires, AR',
        salary: [1_500_000, 1_900_000],
        showSalary: true,
        status: VacancyStatus.PAUSED,
        daysAgo: 25,
        skills: ['Figma', 'Scrum'],
        description:
          'Diseño de producto para la app móvil: investigación con usuarios, prototipos en Figma y trabajo ' +
          'cercano con desarrollo. Búsqueda pausada momentáneamente.',
      },
    ],
  },
  {
    name: 'Bluecore Labs',
    employerEmail: 'talento@bluecore.demo',
    transparentSeal: false,
    vacancies: [
      {
        title: 'Full Stack Developer',
        modality: Modality.HYBRID,
        location: 'Buenos Aires, AR',
        salary: [1_600_000, 2_000_000],
        showSalary: true,
        daysAgo: 1,
        skills: ['React', 'Node.js', 'PostgreSQL', 'Git'],
        description:
          'Buscamos una persona Full Stack para sumarse a un equipo que mantiene y evoluciona productos internos. ' +
          'Stack moderno, revisión de código entre pares y entregas continuas. El proceso lo lleva una persona ' +
          'del equipo técnico, no un filtro automático: todas las postulaciones se leen.',
      },
      {
        title: 'Data Engineer',
        modality: Modality.REMOTE,
        location: 'Argentina',
        salary: [2_000_000, 2_600_000],
        showSalary: false,
        daysAgo: 4,
        skills: ['Python', 'PostgreSQL', 'AWS', 'Docker'],
        description:
          'Diseño y mantenimiento de pipelines de datos en AWS. Vas a trabajar con el equipo de analítica para ' +
          'que los datos lleguen limpios y a tiempo.',
      },
      {
        title: 'DevOps Engineer',
        modality: Modality.ONSITE,
        location: 'Buenos Aires, AR',
        salary: [2_200_000, null],
        showSalary: true,
        daysAgo: 9,
        skills: ['Docker', 'Kubernetes', 'AWS', 'CI/CD'],
        description:
          'Infraestructura como código, clusters de Kubernetes y pipelines de despliegue. Trabajo presencial en ' +
          'Palermo, con guardias rotativas compensadas.',
      },
      {
        title: 'Desarrolladora/or Mobile React Native',
        modality: Modality.REMOTE,
        location: 'Mendoza, AR',
        daysAgo: 15,
        skills: ['React', 'TypeScript', 'JavaScript'],
        description:
          'Desarrollo de nuestra app para iOS y Android con React Native. Vas a participar desde el diseño ' +
          'técnico hasta la publicación en las tiendas.',
      },
    ],
  },
  {
    name: 'Atlas Tech',
    employerEmail: 'empleos@atlastech.demo',
    transparentSeal: false,
    vacancies: [
      {
        title: 'Java Developer Spring Boot',
        modality: Modality.ONSITE,
        location: 'Rosario, AR',
        salary: [1_200_000, 1_500_000],
        showSalary: true,
        daysAgo: 3,
        skills: ['Java', 'Spring Boot', 'MySQL', 'Git'],
        description:
          'Desarrollo de servicios para el área de logística. Trabajo presencial en Rosario, con capacitaciones ' +
          'internas y un equipo con mucha experiencia en sistemas transaccionales.',
      },
      {
        title: 'Frontend Engineer Vue.js',
        modality: Modality.HYBRID,
        location: 'Rosario, AR',
        salary: [1_250_000, 1_550_000],
        showSalary: false,
        daysAgo: 7,
        skills: ['Vue.js', 'JavaScript', 'Testing automatizado'],
        description:
          'Mantenimiento y evolución del portal de clientes en Vue.js. Esquema híbrido: martes y jueves en la ' +
          'oficina del centro de Rosario.',
      },
      {
        title: 'Python Developer Django',
        modality: Modality.REMOTE,
        location: 'Argentina',
        salary: [1_350_000, 1_700_000],
        showSalary: true,
        daysAgo: 10,
        skills: ['Python', 'Django', 'PostgreSQL'],
        description:
          'Desarrollo de APIs en Django para la plataforma de reservas. Buscamos a alguien con ganas de aprender ' +
          'y de mejorar la calidad del código existente.',
      },
      {
        title: 'Scrum Master',
        modality: Modality.HYBRID,
        location: 'Buenos Aires, AR',
        daysAgo: 20,
        skills: ['Scrum', 'Inglés'],
        description:
          'Acompañar a dos equipos de desarrollo en sus ceremonias y en la mejora continua del proceso. Inglés ' +
          'intermedio para reuniones con el equipo de Estados Unidos.',
      },
    ],
  },
];

async function upsertUser(email: string, passwordHash: string, role: Role) {
  return prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash, role } });
}

async function main() {
  const password = process.env.DEMO_PASSWORD ?? '';
  if (password.length < 8) throw new Error('Definí DEMO_PASSWORD (mínimo 8 caracteres) en el .env');
  const passwordHash = await argon2.hash(password);

  for (const name of SKILLS) await prisma.skill.upsert({ where: { name }, update: {}, create: { name } });
  const skillIds = new Map((await prisma.skill.findMany()).map((s) => [s.name, s.id]));

  const employee = await prisma.user.upsert({
    where: { email: 'empleado@conecta.demo' },
    update: {},
    create: {
      email: 'empleado@conecta.demo',
      passwordHash,
      role: Role.EMPLOYEE,
      employeeProfile: { create: { fullName: 'Sofía Castro' } },
    },
  });
  console.log(`Empleado demo: ${employee.email}`);

  for (const c of COMPANIES) {
    const employer = await upsertUser(c.employerEmail, passwordHash, Role.EMPLOYER);
    let membership = await prisma.companyMember.findFirst({ where: { userId: employer.id } });
    if (!membership) {
      const company = await prisma.company.create({
        data: { name: c.name, verificationStatus: VerificationStatus.APPROVED, transparentSeal: c.transparentSeal },
      });
      membership = await prisma.companyMember.create({
        data: { companyId: company.id, userId: employer.id, role: 'owner' },
      });
    }

    const existing = await prisma.vacancy.count({ where: { companyId: membership.companyId } });
    if (existing === 0) {
      for (const v of c.vacancies) {
        const [salaryMin, salaryMax] = v.salary ?? [null, null];
        const showSalary = v.showSalary ?? false;
        await prisma.vacancy.create({
          data: {
            companyId: membership.companyId,
            title: v.title,
            modality: v.modality,
            location: v.location,
            description: v.description,
            salaryMin,
            salaryMax,
            showSalary,
            listedSalaryMin: showSalary ? salaryMin : null,
            listedSalaryMax: showSalary ? salaryMax : null,
            status: v.status ?? VacancyStatus.ACTIVE,
            createdAt: new Date(Date.now() - v.daysAgo * 86_400_000),
            skills: { create: v.skills.map((name) => ({ skillId: skillIds.get(name)! })) },
          },
        });
      }
    }
    console.log(`Empresa demo: ${c.name}${c.transparentSeal ? ' (sello Transparente)' : ''} · empleador ${employer.email}`);
  }

  console.log('\nTodos los usuarios demo usan la contraseña DEMO_PASSWORD del .env.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
