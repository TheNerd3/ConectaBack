# Modelo de datos

Fuente de verdad: [`prisma/schema.prisma`](../prisma/schema.prisma).

```mermaid
erDiagram
  User ||--o| EmployeeProfile : tiene
  User ||--o{ CompanyMember : integra
  Company ||--o{ CompanyMember : tiene
  Company ||--o{ CompanyInvite : invita
  Company ||--o{ Vacancy : publica
  Company ||--o{ RejectionReasonTemplate : define
  Vacancy ||--o{ VacancySkill : requiere
  Skill ||--o{ VacancySkill : en
  EmployeeProfile ||--o{ EmployeeSkill : domina
  Skill ||--o{ EmployeeSkill : en
  EmployeeProfile ||--o{ EmployeeLanguage : habla
  EmployeeProfile ||--o{ Cv : sube
  Vacancy |o--o{ Cv : adaptado_a
  EmployeeProfile ||--o{ Application : envia
  Vacancy ||--o{ Application : recibe
  Cv ||--o{ Application : adjunto_en
  Application ||--o| CoverLetter : incluye
  Application ||--o| CandidateFeedback : recibe
  Application ||--o{ InternalNote : tiene
  Application ||--o{ Message : chat
  Application ||--o{ Interview : agenda
  EmployeeProfile ||--o{ CompanyFollow : sigue
  Company ||--o{ CompanyFollow : seguida
  Skill ||--o{ SkillQuestion : evalua
  EmployeeProfile ||--o{ QuizAttempt : rinde
  User ||--o{ Notification : recibe
  User ||--o{ NotificationPreference : configura
  User ||--o{ Integration : conecta
  Vacancy ||--o{ VacancyReport : denunciada
  User ||--o{ AuditLog : genera
```

## Enumeraciones

| Enum | Valores |
| --- | --- |
| Role | EMPLOYEE, EMPLOYER, ADMIN |
| UserStatus | ACTIVE, SUSPENDED |
| VerificationStatus | PENDING, APPROVED, REJECTED |
| VacancyStatus | ACTIVE, PAUSED |
| Stage | REVIEW, INTERVIEW, HIRED, REJECTED |
| FileType | PDF, DOCX |

## Reglas

- `Application` es única por `(vacancyId, employeeId)`.
- `Cv.isBase = true` y `vacancyId` nulo es el CV base; con `vacancyId` es una versión adaptada.
- El archivo del CV vive en almacenamiento de objetos (`storageKey`); `extractedText` lo usa el analizador.
- `rejectionReason` es siempre opcional.
- `InternalNote` jamás se devuelve en endpoints de empleado.
- Los datos sensibles del candidato se ocultan según `Application.stage`.
- `stage` solo lo cambia una persona y cada cambio se registra en `AuditLog`.
- `Interview.calendarEventId` e `Integration.encryptedToken` van cifrados y no se devuelven por la API.
- `User.passwordHash` (argon2id) y `User.totpSecretEncrypted` nunca se devuelven por la API. `totpSecretEncrypted` es el secreto del 2FA del ADMIN, cifrado con AES-256-GCM usando `ENCRYPTION_KEY`; es nulo para EMPLOYEE y EMPLOYER.
