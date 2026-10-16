# Conecta · Backend

API de **Conecta**, una plataforma de búsqueda laboral con tres roles (empleado, empleador, administrador).

Principios del producto que la API hace cumplir:

- **Sin rechazo automático**: solo una persona mueve una postulación de etapa; cada cambio queda en `AuditLog`.
- **Motivo de rechazo opcional** (banco de motivos de la empresa o texto libre).
- **Notas internas** nunca se exponen a endpoints de empleado.
- **Datos sensibles del candidato** (foto, nombre, edad) ocultos hasta la etapa de entrevista, filtrados en la API según la etapa.
- **Sello "Empresa Transparente"** da prioridad a las vacantes de la empresa.

Frontend: [ConectaFront](https://github.com/TheNerd3/ConectaFront).

## Stack

NestJS · TypeScript · PostgreSQL · Prisma · Swagger · Docker Compose

## Primeros pasos

```bash
npm install
cp .env.example .env
npm run db:up                 # PostgreSQL en Docker
npx prisma migrate dev --name init
npm run start:dev             # http://localhost:3000/api
```

- Swagger: http://localhost:3000/docs
- Health check: `GET /api/health`

## Estructura

```
prisma/schema.prisma   # modelo de datos (26 tablas)
src/
├── main.ts            # prefijo /api, CORS, validación, Swagger
├── app.module.ts
├── prisma/            # PrismaService global
└── health/
docs/DATABASE.md       # diagrama y reglas del modelo
```

## Modelo de datos

26 tablas y 6 enumeraciones. Resumen y diagrama en [docs/DATABASE.md](docs/DATABASE.md).

## Hoja de ruta

1. Auth: registro/login con JWT, guards por rol, 2FA para admin.
2. Perfil de empleado, habilidades, idiomas y subida de CV (PDF/DOCX) con extracción de texto.
3. Empresas, miembros e invitaciones; vacantes.
4. Postulaciones, pipeline, notas internas, chat y entrevistas.
5. Analizador de CV, notificaciones, administración y auditoría.
6. Tests, GitHub Actions y deploy (Render/Railway).

## Pendiente de decidir

- Formato de los CV adaptados a cada vacante (propuesta: siempre PDF).
- Almacenamiento de archivos (S3 compatible / Cloudflare R2).
