import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchSkillsQueryDto, SkillDto } from './dto/skill.dto';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  search({ q, limit = 20 }: SearchSkillsQueryDto): Promise<SkillDto[]> {
    return this.prisma.skill.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }
}
