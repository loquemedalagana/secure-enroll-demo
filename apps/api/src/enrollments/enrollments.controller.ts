import { Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser } from '../auth/current-user.js';
import { Authorize } from '../authz/authorize.decorator.js';
import { CreateEnrollmentDto } from './create-enrollment.dto.js';
import { type EnrollmentView, EnrollmentsService } from './enrollments.service.js';

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

  // 신청 생성. 학생만 할 수 있다(인가 Guard가 판단한다). 정원이 찼거나 이미 신청한 강의면 409다.
  // 누구의 신청인지는 인증 Guard가 토큰으로 확인한 사용자로 정한다. 본문의 값으로 정하지 않는다.
  @Post()
  @Authorize('enrollment:create')
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEnrollmentDto): Promise<EnrollmentView> {
    return this.enrollments.create(user.id, body.courseId, body.phone);
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

  // 신청 취소. 소유자와 관리자만 할 수 있다(인가 Guard가 판단한다). 없는 id는 인가 Guard가 404로 끝낸다.
  @Delete(':id')
  @HttpCode(204)
  @Authorize('enrollment:cancel', { resource: 'enrollment' })
  async cancel(@Param('id') id: string): Promise<void> {
    await this.enrollments.cancel(id);
  }
}
