import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.js';
import { enrollmentScope } from '../authz/policy.js';
import { Prisma } from '../generated/prisma/client.js';
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

  // 신청을 생성한다. 락, 신청 수 조회, 삽입을 트랜잭션 하나로 처리한다.
  // 강의 행에 행 단위 락을 건다(FOR UPDATE). 락을 건 요청이 끝날 때까지 같은 강의의 다른 신청은 기다리므로,
  // 동시에 온 두 요청이 모두 삽입 전의 신청 수를 조회해 정원을 넘는 일이 없다. 다른 강의의 신청은 기다리지 않는다.
  // 이 방식을 고른 이유는 docs/decisions.md 11번에 있다.
  async create(userId: string, courseId: string, phone: string): Promise<EnrollmentView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const courses = await tx.$queryRaw<{ capacity: number }[]>`
          SELECT capacity FROM courses WHERE id = ${courseId} FOR UPDATE`;
        const course = courses[0];
        if (!course) throw new NotFoundException();
        const taken = await tx.enrollment.count({ where: { courseId } });
        if (taken >= course.capacity) throw new ConflictException();
        return tx.enrollment.create({ data: { userId, courseId, phone }, select: VIEW });
      });
    } catch (error) {
      // (사용자, 강의) 유일 제약에 걸린 경우다. 같은 학생이 같은 강의를 다시 신청했다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException();
      throw error;
    }
  }

  // 이미 삭제된 신청이어도 오류로 보지 않는다. 같은 취소가 두 번 와도 결과는 같다.
  async cancel(id: string): Promise<void> {
    await this.prisma.enrollment.deleteMany({ where: { id } });
  }

  listAll(): Promise<EnrollmentView[]> {
    return this.prisma.enrollment.findMany({ select: VIEW, orderBy: { id: 'asc' } });
  }
}
