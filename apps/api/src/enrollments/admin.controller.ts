import { Controller, Get, Header } from '@nestjs/common';
import { Authorize } from '../authz/authorize.decorator.js';
import { type EnrollmentView, EnrollmentsService } from './enrollments.service.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  // 전체 신청 목록을 조회한다. 관리자만 조회할 수 있다.
  @Get('enrollments')
  @Authorize('admin:read')
  @Header('Cache-Control', 'no-store')
  listAll(): Promise<EnrollmentView[]> {
    return this.enrollments.listAll();
  }
}
