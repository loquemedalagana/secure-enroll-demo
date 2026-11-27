import { Injectable } from '@nestjs/common';
import type { EnrollmentView } from '../enrollments/enrollments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// 강의 목록에 내보내는 모양. 누구나 볼 수 있는 값만 넣는다.
export type CourseView = { id: string; title: string };

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<CourseView[]> {
    return this.prisma.course.findMany({ select: { id: true, title: true }, orderBy: { id: 'asc' } });
  }

  // 제목에 검색어가 들어 있는 강의. 대소문자는 구분하지 않는다.
  search(q: string): Promise<CourseView[]> {
    return this.prisma.$queryRawUnsafe<CourseView[]>(
      `SELECT id, title FROM courses WHERE title ILIKE '%${q}%' ORDER BY id ASC`,
    );
  }

  // 강의 하나의 수강생 명단. 전화번호가 들어 있다.
  roster(courseId: string): Promise<EnrollmentView[]> {
    return this.prisma.enrollment.findMany({
      where: { courseId },
      select: { id: true, userId: true, courseId: true, phone: true },
      orderBy: { id: 'asc' },
    });
  }
}
