import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Public } from '../decorators/public.decorator';
import { AccessTokenDto } from '../dto/auth-response.dto';
import { CompleteEmployerSignupDto, OAuthExchangeDto, OAuthStartQueryDto } from '../dto/oauth.dto';
import { parseProvider } from './oauth-providers';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_SECONDS, OAuthService } from './oauth.service';

// Tipos mínimos de express (Nest corre sobre express).
interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge?: number;
}
interface HttpResponse {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: CookieOptions): void;
  redirect(url: string): void;
}
interface HttpRequest {
  headers: { cookie?: string };
}

const COOKIE_PATH = '/api/auth/oauth';
const OAUTH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
const EXCHANGE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

function readCookie(req: HttpRequest, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
}

@ApiTags('auth')
@ApiTooManyRequestsResponse({ description: 'Demasiados intentos, probá de nuevo en un minuto' })
@Controller('auth/oauth')
export class OAuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly oauth: OAuthService,
    config: ConfigService,
  ) {
    this.secureCookies = config.get('NODE_ENV') === 'production';
  }

  @Public()
  @Throttle(OAUTH_THROTTLE)
  @Get(':provider')
  @ApiOperation({
    summary: 'Inicia el login con Google o GitHub (navegación del navegador, no fetch)',
    description: 'Redirige al proveedor. Si la cuenta no existe, se crea con el rol indicado (EMPLOYEE o EMPLOYER).',
  })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  @ApiFoundResponse({ description: 'Redirección al proveedor, o al front con #error si no está configurado' })
  async start(@Param('provider') slug: string, @Query() query: OAuthStartQueryDto, @Res() res: HttpResponse) {
    const role = query.role ?? Role.EMPLOYEE;
    const provider = parseProvider(slug);
    if (!provider) return res.redirect(this.oauth.errorRedirect('provider_not_configured', role));

    const { redirectUrl, stateCookie } = await this.oauth.start(provider, role);
    if (stateCookie) {
      res.cookie(OAUTH_STATE_COOKIE, stateCookie, {
        ...this.cookieOptions(),
        maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
      });
    }
    res.redirect(redirectUrl);
  }

  @Public()
  @Throttle(OAUTH_THROTTLE)
  @Get(':provider/callback')
  @ApiOperation({ summary: 'Vuelta del proveedor OAuth (la llama el proveedor, no el front)' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  @ApiFoundResponse({ description: 'Redirección a /auth/callback del front con #code, #signup o #error' })
  async callback(
    @Param('provider') slug: string,
    @Query() query: Record<string, string | undefined>,
    @Req() req: HttpRequest,
    @Res() res: HttpResponse,
  ) {
    const cookie = readCookie(req, OAUTH_STATE_COOKIE);
    res.clearCookie(OAUTH_STATE_COOKIE, this.cookieOptions());
    const provider = parseProvider(slug);
    if (!provider) return res.redirect(this.oauth.errorRedirect('state'));
    res.redirect(
      await this.oauth.handleCallback(provider, { code: query.code, state: query.state, error: query.error }, cookie),
    );
  }

  @Public()
  @Throttle(EXCHANGE_THROTTLE)
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Canjea el código de un solo uso del callback por un access token' })
  @ApiOkResponse({ type: AccessTokenDto })
  @ApiUnauthorizedResponse({ description: 'Código inválido, usado o vencido' })
  exchange(@Body() dto: OAuthExchangeDto): Promise<AccessTokenDto> {
    return this.oauth.exchange(dto.code);
  }

  @Public()
  @Throttle(EXCHANGE_THROTTLE)
  @Post('complete-employer')
  @ApiOperation({ summary: 'Completa el registro de empleador hecho con Google/GitHub (nombre de la empresa)' })
  @ApiCreatedResponse({ type: AccessTokenDto })
  @ApiUnauthorizedResponse({ description: 'Token de registro inválido o vencido' })
  @ApiConflictResponse({ description: 'No se pudo completar el registro' })
  completeEmployer(@Body() dto: CompleteEmployerSignupDto): Promise<AccessTokenDto> {
    return this.oauth.completeEmployerSignup(dto);
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.secureCookies, path: COOKIE_PATH };
  }
}
