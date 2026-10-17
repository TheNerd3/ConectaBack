import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateVacancyDto, UpdateVacancyDto, UpdateVacancyStatusDto } from './dto/vacancy-input.dto';
import { EmployerVacanciesDto, EmployerVacancyDetailDto } from './dto/vacancy-response.dto';
import { EmployerVacanciesService } from './employer-vacancies.service';

@ApiTags('vacancies (empleador)')
@ApiBearerAuth()
@Roles(Role.EMPLOYER)
@ApiForbiddenResponse({ description: 'Sin empresa, o empresa no verificada (para crear/editar/pausar)' })
@Controller('employer/vacancies')
export class EmployerVacanciesController {
  constructor(private readonly vacancies: EmployerVacanciesService) {}

  @Get()
  @ApiOperation({ summary: 'Vacantes de mi empresa, con estado de la empresa y conteos de postulaciones' })
  @ApiOkResponse({ type: EmployerVacanciesDto })
  list(@CurrentUser() user: AuthUser): Promise<EmployerVacanciesDto> {
    return this.vacancies.list(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una vacante de mi empresa' })
  @ApiOkResponse({ type: EmployerVacancyDetailDto })
  @ApiNotFoundResponse({ description: 'No existe o es de otra empresa' })
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<EmployerVacancyDetailDto> {
    return this.vacancies.findOne(user.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Publicar vacante (empresa APPROVED)' })
  @ApiCreatedResponse({ type: EmployerVacancyDetailDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos, rango salarial incoherente o skill inexistente' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVacancyDto): Promise<EmployerVacancyDetailDto> {
    return this.vacancies.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar vacante de mi empresa (empresa APPROVED)' })
  @ApiOkResponse({ type: EmployerVacancyDetailDto })
  @ApiNotFoundResponse({ description: 'No existe o es de otra empresa' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVacancyDto,
  ): Promise<EmployerVacancyDetailDto> {
    return this.vacancies.update(user.id, id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Pausar o reactivar una vacante de mi empresa (empresa APPROVED)' })
  @ApiOkResponse({ type: EmployerVacancyDetailDto })
  @ApiNotFoundResponse({ description: 'No existe o es de otra empresa' })
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVacancyStatusDto,
  ): Promise<EmployerVacancyDetailDto> {
    return this.vacancies.setStatus(user.id, id, dto.status);
  }
}
