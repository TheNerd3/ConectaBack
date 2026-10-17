import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { SearchSkillsQueryDto, SkillDto } from './dto/skill.dto';
import { SkillsService } from './skills.service';

@ApiTags('skills')
@ApiBearerAuth()
@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Roles(Role.EMPLOYEE, Role.EMPLOYER, Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Catálogo de skills: lista y búsqueda por nombre' })
  @ApiOkResponse({ type: [SkillDto] })
  search(@Query() query: SearchSkillsQueryDto): Promise<SkillDto[]> {
    return this.skills.search(query);
  }
}
