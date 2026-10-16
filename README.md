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
cp .env.example .env          # completar JWT_SECRET, ENCRYPTION_KEY y ADMIN_PASSWORD (ver comentarios)
npm run db:up                 # PostgreSQL en Docker
npm run mail:up               # Mailpit: SMTP de desarrollo, bandeja en http://localhost:8025
npx prisma migrate dev        # aplica las migraciones
npm run db:seed               # crea la cuenta de administración (ver abajo)
npm run start:dev             # http://localhost:3000/api
```

- Swagger: http://localhost:3000/docs
- Health check: `GET /api/health`
- Tests: `npm test`

La API no arranca si falta `JWT_SECRET` (mínimo 32 caracteres) o si `ENCRYPTION_KEY` no es una clave de 32 bytes en base64 o hex.

## Cuenta de administración (seed)

El rol ADMIN no se puede registrar por la API: se crea con `prisma/seed.ts`.

1. En el `.env`, definí `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 12 caracteres). `ENCRYPTION_KEY` tiene que estar definida y no debe cambiar después: con ella se cifra el secreto del 2FA.
2. Corré `npm run db:seed`. La consola muestra **una sola vez** el secreto TOTP y una URI `otpauth://`.
3. Cargá el secreto (o un QR generado desde la URI) en una app de autenticación: Google Authenticator, Authy, 1Password, etc.
4. Iniciá sesión en `/admin/login` del front con el email, la contraseña y el código de 6 dígitos de la app.

El seed es idempotente: si el admin ya existe no lo modifica. Para regenerar el 2FA (por ejemplo, si se perdió el celular), corré `ADMIN_RESET_2FA=true npm run db:seed`. El código anterior deja de funcionar.

## Autenticación

| Endpoint | Acceso | Descripción |
| --- | --- | --- |
| `POST /api/auth/register/employee` | público | Registro de empleado (email, contraseña, nombre completo) |
| `POST /api/auth/register/employer` | público | Registro de empleador: crea la empresa en estado `PENDING` y lo asigna como `owner` |
| `POST /api/auth/login` | público | Devuelve `accessToken`; si el usuario es ADMIN devuelve `requires2fa` y un `challengeToken` (5 min) |
| `POST /api/auth/login/2fa` | público | `challengeToken` + código TOTP → `accessToken` |
| `POST /api/auth/password/forgot` | público | Envía por email un link para restablecer la contraseña (respuesta siempre igual) |
| `POST /api/auth/password/reset` | público | Token del email + contraseña nueva → `accessToken`; invalida las sesiones anteriores |
| `GET /api/auth/oauth/:provider` | público | Inicia el login con `google` o `github` (`?role=EMPLOYEE|EMPLOYER` para cuentas nuevas) |
| `GET /api/auth/oauth/:provider/callback` | público | Vuelta del proveedor; redirige al front (`/auth/callback`) |
| `POST /api/auth/oauth/exchange` | público | Canjea el código de un solo uso del callback por un `accessToken` |
| `POST /api/auth/oauth/complete-employer` | público | Completa el registro de empleador hecho con Google/GitHub (nombre de la empresa) |
| `GET /api/auth/me` | los tres roles | Usuario autenticado |

- Contraseñas con argon2id. El access token es un JWT que dura 1 hora (`JWT_EXPIRES_IN`).
- Los guards son globales y **deniegan por defecto**: cada endpoint declara `@Public()` o `@Roles(...)`, y si no declara ninguno responde 403.
- El `challengeToken` del 2FA lleva `purpose: "2fa"` y no sirve como access token.
- Los errores de login son genéricos ("Credenciales inválidas") y los usuarios `SUSPENDED` no pueden ingresar. Si se suspende a alguien con una sesión abierta, sus requests empiezan a fallar.
- Rate limiting por IP: 5 intentos por minuto en login y 2FA, 10 en registro y 100 en el resto.

### Login con Google y GitHub

- Flujo *authorization code* con `state` y PKCE. El `state` y el verifier viajan en una cookie httpOnly firmada.
- Si el email del proveedor está **verificado** y ya existe una cuenta con ese email, se vincula. Si no está verificado, no se vincula ni se crea nada.
- Las cuentas nuevas de empleado se crean al toque y sin contraseña. Las de empleador pasan por un paso extra donde se pide el nombre de la empresa.
- Un ADMIN nunca entra por OAuth: siempre usa contraseña + 2FA.
- El JWT nunca viaja en la URL. El callback deja en el fragmento (`#code=`) un código de un solo uso de 60 segundos, y el front lo canjea.

**Configurar las credenciales** (si faltan, el botón vuelve al login con "no disponible"):

1. **Google**: en [Google Cloud Console](https://console.cloud.google.com/apis/credentials) creá un "ID de cliente de OAuth" de tipo *Aplicación web*.
   - URI de redireccionamiento autorizado: `http://localhost:3000/api/auth/oauth/google/callback`.
   - Copiá el ID y el secreto a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
2. **GitHub**: en *Settings → Developer settings → OAuth Apps → New OAuth App* (<https://github.com/settings/developers>).
   - *Authorization callback URL*: `http://localhost:3000/api/auth/oauth/github/callback`.
   - Copiá el Client ID y un Client secret nuevo a `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET`.
3. En producción, usá las URLs reales y definí `API_PUBLIC_URL` y `FRONT_URL`. Con `NODE_ENV=production` la cookie de estado es `Secure`.

### Recuperar contraseña

- Solo para EMPLOYEE y EMPLOYER: el ADMIN cambia su contraseña con el seed.
- El link vence en 30 minutos y es de un solo uso. Pedir otro anula el anterior.
- En la DB solo se guarda el hash SHA-256 del token.
- También sirve para que una cuenta creada con Google/GitHub defina una contraseña.
- Emails por SMTP (`SMTP_*`, `MAIL_FROM`). En desarrollo, `npm run mail:up` levanta Mailpit y los emails se ven en <http://localhost:8025>.

**Mejoras pendientes:**
- Refresh token y access token de vida más corta.
- Los códigos de canje de OAuth viven en memoria: alcanza con una instancia de la API. Para escalar, moverlos a Redis o a la DB.
- Evitar que se reuse un código TOTP dentro de su ventana de validez.
- Verificación de email en el registro: hoy el registro responde 409 si el email ya está en uso.

## Estructura

```
prisma/schema.prisma   # modelo de datos (28 tablas)
src/
├── main.ts            # prefijo /api, CORS, validación, Swagger
├── app.module.ts
├── prisma/            # PrismaService global
├── auth/              # registro, login, 2FA, OAuth, recuperar contraseña, guards y @Public/@Roles
├── mail/              # envío de emails por SMTP
├── common/crypto.ts   # cifrado AES-256-GCM de secretos
├── config/            # validación de variables de entorno
└── health/
prisma/seed.ts         # crea la cuenta ADMIN con 2FA
test/                  # tests unitarios y e2e (Jest)
docs/DATABASE.md       # diagrama y reglas del modelo
```

## Modelo de datos

28 tablas y 7 enumeraciones. Resumen y diagrama en [docs/DATABASE.md](docs/DATABASE.md).

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
