import { Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser } from '../auth/current-user.js';
import { Authorize } from '../authz/authorize.decorator.js';
import { CreateEnrollmentDto } from './create-enrollment.dto.js';
import { type EnrollmentView, EnrollmentsService } from './enrollments.service.js';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  // 요청한 사람이 조회할 수 있는 신청 목록으로 응답한다.
  // 학생에게는 본인의 신청, 강사에게는 담당 강의의 신청, 관리자에게는 전체 신청으로 응답한다.
  @Get()
  @Authorize('enrollment:list')
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser): Promise<EnrollmentView[]> {
    return this.enrollments.listFor(user);
  }

  // 신청을 받는다(신청 생성). 학생만 신청할 수 있고, 인가 Guard가 can()을 호출해 판단한다.
  // 정원이 찬 강의나 이미 신청한 강의를 신청하면 409로 응답한다.
  // create()는 신청자를 request body에서 읽지 않고, 토큰의 사용자(user.id)로 정한다.
  @Post()
  @Authorize('enrollment:create')
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEnrollmentDto): Promise<EnrollmentView> {
    return this.enrollments.create(user.id, body.courseId, body.phone);
  }

  // 신청 한 건을 조회한다. 신청자, 그 강의의 담당 강사, 관리자만 조회할 수 있고, 인가 Guard가 can()을 호출해 판단한다.
  @Get(':id')
  @Authorize('enrollment:read', { resource: 'enrollment' })
  @Header('Cache-Control', 'no-store')
  async findOne(@Param('id') id: string): Promise<EnrollmentView> {
    const enrollment = await this.enrollments.findById(id);
    if (!enrollment) throw new NotFoundException();
    return enrollment;
  }

  // 신청을 취소한다. 신청자와 관리자만 취소할 수 있고, 인가 Guard가 can()을 호출해 판단한다.
  // 존재하지 않는 id로 요청하면 인가 Guard가 404로 응답한다.
  @Delete(':id')
  @HttpCode(204)
  @Authorize('enrollment:cancel', { resource: 'enrollment' })
  async cancel(@Param('id') id: string): Promise<void> {
    await this.enrollments.cancel(id);
  }
}
