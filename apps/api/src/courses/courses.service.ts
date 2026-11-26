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

  // 강의 하나의 수강생 명단. 전화번호가 들어 있다.
  roster(courseId: string): Promise<EnrollmentView[]> {
    return this.prisma.enrollment.findMany({
      where: { courseId },
      select: { id: true, userId: true, courseId: true, phone: true },
      orderBy: { id: 'asc' },
    });
  }
}
