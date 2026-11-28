import { Injectable } from '@nestjs/common';
import type { EnrollmentView } from '../enrollments/enrollments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// 강의 목록의 응답에 포함하는 필드다. 공개 경로의 응답이므로 누구나 조회해도 되는 id와 title만 포함한다.
export type CourseView = { id: string; title: string };

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<CourseView[]> {
    return this.prisma.course.findMany({ select: { id: true, title: true }, orderBy: { id: 'asc' } });
  }

  // 제목에 검색어가 포함된 강의를 DB에서 읽는다. 대소문자는 구분하지 않는다(ILIKE).
  // 검색어는 SQL 문자열에 포함하지 않고 플레이스홀더의 값으로 넘긴다. $queryRawUnsafe로 바꾸지 않는다.
  search(q: string): Promise<CourseView[]> {
    // 검색어의 %와 _는 LIKE의 와일드카드라서, 글자 그대로 찾도록 앞에 역슬래시를 붙인다.
    // 역슬래시는 PostgreSQL에서 LIKE의 기본 이스케이프 문자다. 이 이스케이프를 적용하지 않으면 검색 결과만 달라진다.
    const literal = q.replace(/[\\%_]/g, '\\$&');
    return this.prisma.$queryRaw<CourseView[]>`
      SELECT id, title FROM courses WHERE title ILIKE ${`%${literal}%`} ORDER BY id ASC`;
  }

  // 강의 하나의 수강생 명단을 DB에서 읽는다. 명단에는 전화번호가 들어 있다.
  roster(courseId: string): Promise<EnrollmentView[]> {
    return this.prisma.enrollment.findMany({
      where: { courseId },
      select: { id: true, userId: true, courseId: true, phone: true },
      orderBy: { id: 'asc' },
    });
  }
}
