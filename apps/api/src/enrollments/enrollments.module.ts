import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { EnrollmentsController } from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';

@Module({
  controllers: [EnrollmentsController, AdminController],
  providers: [EnrollmentsService],
})
export class EnrollmentsModule {}
