# Conecta · Backend (ConectaBack)

## Regla #1: autoría
- El único autor de este proyecto es Sol. **Nunca** agregar a Claude como autor ni colaborador: sin `Co-Authored-By`, sin `Claude-Session`, sin "Generated with Claude Code" ni firmas en commits, PRs, código, README o docs.
- Los commits van con la identidad git de Sol (`git config user.name` / `user.email`); no cambiarla.

## Qué es
API de una plataforma de búsqueda laboral con tres roles: EMPLOYEE, EMPLOYER y ADMIN. Proyecto personal de portfolio. Diferenciador: **sin filtrado automático de candidatos por IA** y **transparencia total del estado de la postulación**.
Frontend: repo ConectaFront (React + Vite). Modelo de datos: `prisma/schema.prisma` (fuente de verdad) y `docs/DATABASE.md`.

## Stack
NestJS 11 + TypeScript (strict) · PostgreSQL 16 · Prisma 6 · class-validator · Swagger (`/docs`) · JWT · Docker Compose para la DB.

## Comandos
- `npm run db:up` levanta PostgreSQL · `npx prisma migrate dev --name <cambio>` · `npx prisma generate`
- `npm run start:dev` · `npm run build` (debe pasar antes de cada commit)

## Reglas de negocio (INNEGOCIABLES)
1. **Nunca rechazar ni mover de etapa automáticamente.** Solo una persona (EMPLOYER) cambia `Application.stage`, y cada cambio se registra en `AuditLog`. No agregar scoring que descarte candidatos.
2. `matchPercent` es informativo; jamás filtra ni oculta postulaciones.
3. `rejectionReason` es siempre opcional.
4. `InternalNote` nunca se devuelve en endpoints de EMPLOYEE (ni en DTOs compartidos).
5. Datos sensibles del candidato (foto, nombre, edad) se ocultan al empleador hasta la etapa INTERVIEW; el filtrado se hace en el backend, no en el front.
6. `Integration.encryptedToken` y `Interview.calendarEventId` se guardan cifrados y no se devuelven por la API.
7. Una postulación por `(vacancyId, employeeId)`.
8. El sello "Empresa Transparente" (`transparentSeal`) solo lo otorga ADMIN y da prioridad a las vacantes.
9. Admin requiere 2FA. Cada endpoint declara explícitamente su rol con un guard; por defecto, denegar.
10. La mascota es solo visual: solo se persiste `User.mascotEnabled`.

## Convenciones
- Un módulo Nest por dominio en `src/<dominio>/` (module, controller, service, dto/).
- Controllers finos; la lógica y el acceso a Prisma van en services.
- Todo input pasa por DTOs con class-validator; nunca devolver entidades Prisma crudas, usar DTOs de respuesta.
- Documentar cada endpoint con decoradores de Swagger.
- Nunca devolver `passwordHash`.
- Cambios de esquema solo con migraciones Prisma, nunca editar la DB a mano.
- Archivos (CV PDF/DOCX) en almacenamiento de objetos; en DB solo `storageKey`. El texto extraído va en `Cv.extractedText`.
- Commits chicos y en español, estilo `feat(auth): ...`, `fix(applications): ...`.

## Cómo trabajar
- Responder y comentar en español; código e identificadores en inglés.
- Antes de un cambio grande, proponer el plan en pocas líneas y esperar OK.
- Cambios mínimos y enfocados; no refactorizar código no relacionado.
- Agregar tests para reglas de negocio críticas (1, 4, 5 y 9 como mínimo).
- No instalar dependencias nuevas sin avisar por qué.
- Nunca commitear `.env` ni secretos.
