import { Module } from '@nestjs/common';
import { EmployerVacanciesController } from './employer-vacancies.controller';
import { EmployerVacanciesService } from './employer-vacancies.service';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';

@Module({
  controllers: [VacanciesController, EmployerVacanciesController],
  providers: [VacanciesService, EmployerVacanciesService],
})
export class VacanciesModule {}
