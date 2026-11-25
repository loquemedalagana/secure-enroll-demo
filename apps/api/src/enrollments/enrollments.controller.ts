import { Controller, Get, Header, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { type AuthUser, CurrentUser } from '../auth/current-user.js';
import { Authorize } from '../authz/authorize.decorator.js';
import { AuthzGuard } from '../authz/authz.guard.js';
import { type EnrollmentView, EnrollmentsService } from './enrollments.service.js';

@UseGuards(AuthGuard, AuthzGuard)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  // 내가 볼 수 있는 신청 목록. 학생은 자기 신청, 강사는 자기 강의의 신청, 관리자는 전체.
  @Get()
  @Authorize('enrollment:list')
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser): Promise<EnrollmentView[]> {
    return this.enrollments.listFor(user);
  }

  // 신청 한 건. 소유자, 그 강의의 담당 강사, 관리자만 볼 수 있다(인가 Guard가 판단한다).
  @Get(':id')
  @Authorize('enrollment:read', { resource: 'enrollment' })
  @Header('Cache-Control', 'no-store')
  async findOne(@Param('id') id: string): Promise<EnrollmentView> {
    const enrollment = await this.enrollments.findById(id);
    if (!enrollment) throw new NotFoundException();
    return enrollment;
  }
}
