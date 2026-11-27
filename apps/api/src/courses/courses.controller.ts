import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { Authorize } from '../authz/authorize.decorator.js';
import type { EnrollmentView } from '../enrollments/enrollments.service.js';
import { type CourseView, CoursesService } from './courses.service.js';
import { SearchCoursesDto } from './search-courses.dto.js';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  // 강의 목록. 로그인하지 않아도 볼 수 있다. q가 있으면 제목에 그 말이 들어 있는 강의만 돌려준다.
  @Public()
  @Get()
  list(@Query() query: SearchCoursesDto): Promise<CourseView[]> {
    return query.q ? this.courses.search(query.q) : this.courses.list();
  }

  // 강의 하나의 수강생 명단. 그 강의의 담당 강사와 관리자만 볼 수 있다(인가 Guard가 판단한다).
  @Get(':id/enrollments')
  @Authorize('roster:read', { resource: 'course' })
  @Header('Cache-Control', 'no-store')
  roster(@Param('id') id: string): Promise<EnrollmentView[]> {
    return this.courses.roster(id);
  }
}
