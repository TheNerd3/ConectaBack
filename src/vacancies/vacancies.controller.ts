import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { SearchVacanciesQueryDto } from './dto/search-vacancies.query';
import { VacancyDetailDto, VacancyPageDto } from './dto/vacancy-response.dto';
import { VacanciesService } from './vacancies.service';

@ApiTags('vacancies')
@ApiBearerAuth()
@Roles(Role.EMPLOYEE)
@Controller('vacancies')
export class VacanciesController {
  constructor(private readonly vacancies: VacanciesService) {}

  @Get()
  @ApiOperation({
    summary: 'Buscar vacantes activas (empleado)',
    description:
      'Filtros por texto, modalidad, ubicación, skills y rango salarial; paginado. Las vacantes de empresas con ' +
      'sello Transparente van primero, pero ninguna se oculta. El salario solo se devuelve si la empresa lo muestra.',
  })
  @ApiOkResponse({ type: VacancyPageDto })
  search(@Query() query: SearchVacanciesQueryDto): Promise<VacancyPageDto> {
    return this.vacancies.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una vacante activa (empleado)' })
  @ApiOkResponse({ type: VacancyDetailDto })
  @ApiNotFoundResponse({ description: 'No existe o no está activa' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<VacancyDetailDto> {
    return this.vacancies.findOne(id);
  }
}
