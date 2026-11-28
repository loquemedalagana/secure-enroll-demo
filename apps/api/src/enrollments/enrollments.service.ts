import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.js';
import { enrollmentScope } from '../authz/policy.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// 신청 응답에 포함하는 필드다. phone은 개인정보(전화번호)의 예로 둔 컬럼이고, 값은 더미다.
export type EnrollmentView = { id: string; userId: string; courseId: string; phone: string };

const VIEW = { id: true, userId: true, courseId: true, phone: true } as const;

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // user가 조회할 수 있는 신청만 DB에서 읽어 반환한다. 조건은 enrollmentScope(user)가 정한다.
  async listFor(user: AuthUser): Promise<EnrollmentView[]> {
    const scope = enrollmentScope(user);
    if (scope === null) return [];
    return this.prisma.enrollment.findMany({ where: scope, select: VIEW, orderBy: { id: 'asc' } });
  }

  findById(id: string): Promise<EnrollmentView | null> {
    return this.prisma.enrollment.findUnique({ where: { id }, select: VIEW });
  }

  // 신청을 DB에 저장한다(신청 생성). 강의 행의 락, 신청 수 확인, 삽입을 트랜잭션 하나로 실행한다.
  // 강의 행에 행 단위 락을 건다(FOR UPDATE). 락을 건 트랜잭션이 끝날 때까지 같은 강의에 대한 다른 신청의 트랜잭션은 기다린다.
  // 그래서 동시에 온 두 요청이 모두 삽입 전의 신청 수를 읽어 정원을 넘기는 일이 없다. 다른 강의의 신청은 기다리지 않는다.
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
      // 같은 학생이 같은 강의를 다시 신청하면 (사용자, 강의) 고유 제약 조건을 위반해 Prisma가 P2002 오류를 던진다. 이때 409로 응답한다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException();
      throw error;
    }
  }

  // 이미 삭제한 신청의 id로 호출해도 오류를 던지지 않는다(deleteMany). 같은 취소 요청을 두 번 보내도 DB의 상태는 같다.
  async cancel(id: string): Promise<void> {
    await this.prisma.enrollment.deleteMany({ where: { id } });
  }

  listAll(): Promise<EnrollmentView[]> {
    return this.prisma.enrollment.findMany({ select: VIEW, orderBy: { id: 'asc' } });
  }
}
