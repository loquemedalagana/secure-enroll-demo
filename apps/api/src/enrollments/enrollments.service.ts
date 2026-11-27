import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.js';
import { enrollmentScope } from '../authz/policy.js';
import { PrismaService } from '../prisma/prisma.service.js';

// 응답으로 내보내는 신청의 모양. phone은 개인정보 예시 컬럼(더미 값)이다.
export type EnrollmentView = { id: string; userId: string; courseId: string; phone: string };

const VIEW = { id: true, userId: true, courseId: true, phone: true } as const;

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // 이 사용자가 볼 수 있는 신청만 돌려준다. 범위는 정책(enrollmentScope)이 정한다.
  async listFor(user: AuthUser): Promise<EnrollmentView[]> {
    const scope = enrollmentScope(user);
    if (scope === null) return [];
    return this.prisma.enrollment.findMany({ where: scope, select: VIEW, orderBy: { id: 'asc' } });
  }

  findById(id: string): Promise<EnrollmentView | null> {
    return this.prisma.enrollment.findUnique({ where: { id }, select: VIEW });
  }

  // 이미 지워진 신청이어도 오류로 보지 않는다. 같은 취소가 두 번 와도 결과는 같다.
  async cancel(id: string): Promise<void> {
    await this.prisma.enrollment.deleteMany({ where: { id } });
  }

  listAll(): Promise<EnrollmentView[]> {
    return this.prisma.enrollment.findMany({ select: VIEW, orderBy: { id: 'asc' } });
  }
}
