import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { Authorize } from '../authz/authorize.decorator.js';
import type { EnrollmentView } from '../enrollments/enrollments.service.js';
import { type CourseView, CoursesService } from './courses.service.js';
import { SearchCoursesDto } from './search-courses.dto.js';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  // 강의 목록을 조회하는 공개 경로다. 쿼리 문자열에 q가 있으면 제목에 q가 포함된 강의만으로 응답한다.
  @Public()
  @Get()
  list(@Query() query: SearchCoursesDto): Promise<CourseView[]> {
    return query.q ? this.courses.search(query.q) : this.courses.list();
  }

  // 강의 하나의 수강생 명단을 조회한다. 그 강의의 담당 강사와 관리자만 조회할 수 있고, 인가 Guard가 can()을 호출해 판단한다.
  @Get(':id/enrollments')
  @Authorize('roster:read', { resource: 'course' })
  @Header('Cache-Control', 'no-store')
  roster(@Param('id') id: string): Promise<EnrollmentView[]> {
    return this.courses.roster(id);
  }
}
