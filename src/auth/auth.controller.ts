import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { AccessTokenDto, AuthUserDto, LoginResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { RegisterEmployerDto } from './dto/register-employer.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';

// Límites por IP y por minuto.
const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const REGISTER_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@ApiTooManyRequestsResponse({ description: 'Demasiados intentos, probá de nuevo en un minuto' })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(REGISTER_THROTTLE)
  @Post('register/employee')
  @ApiOperation({ summary: 'Registro de empleado (busca trabajo)' })
  @ApiCreatedResponse({ type: AccessTokenDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  @ApiConflictResponse({ description: 'No se pudo completar el registro' })
  registerEmployee(@Body() dto: RegisterEmployeeDto): Promise<AccessTokenDto> {
    return this.auth.registerEmployee(dto);
  }

  @Public()
  @Throttle(REGISTER_THROTTLE)
  @Post('register/employer')
  @ApiOperation({ summary: 'Registro de empleador: crea la empresa (PENDING) y lo asigna como owner' })
  @ApiCreatedResponse({ type: AccessTokenDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  @ApiConflictResponse({ description: 'No se pudo completar el registro' })
  registerEmployer(@Body() dto: RegisterEmployerDto): Promise<AccessTokenDto> {
    return this.auth.registerEmployer(dto);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login con email y contraseña',
    description:
      'EMPLOYEE y EMPLOYER reciben `accessToken`. ADMIN recibe `requires2fa` + `challengeToken` ' +
      'y completa el ingreso en POST /auth/login/2fa.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas' })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Segundo paso del login de ADMIN: código TOTP' })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiUnauthorizedResponse({ description: 'Código inválido o vencido' })
  verify2fa(@Body() dto: Verify2faDto): Promise<AccessTokenDto> {
    return this.auth.verify2fa(dto);
  }

  @Roles(Role.EMPLOYEE, Role.EMPLOYER, Role.ADMIN)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado' })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    return this.auth.me(user.id);
  }
}
