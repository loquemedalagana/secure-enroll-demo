import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../auth/current-user.js';
import { isPublic } from '../auth/is-public.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUTHORIZE, type AuthorizeRule } from './authorize.decorator.js';
import { type Resource, can } from './policy.js';

// 인가 Guard는 인증 Guard 다음에 실행된다.
// 핸들러에 붙은 @Authorize의 행위(action)로 can()을 호출하고, can()이 false를 반환하면 403으로 응답한다.
// @Authorize가 붙지 않은 핸들러의 요청에도 403으로 응답한다.
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublic(this.reflector, context)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user ?? null;
    if (!user) throw new UnauthorizedException();

    const rule = this.reflector.getAllAndOverride<AuthorizeRule | undefined>(AUTHORIZE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) throw new ForbiddenException();

    let resource: Resource | undefined;
    if (rule.resource === 'enrollment') {
      const id = req.params['id'];
      const enrollment =
        typeof id === 'string'
          ? await this.prisma.enrollment.findUnique({
              where: { id },
              select: { userId: true, course: { select: { instructorId: true } } },
            })
          : null;
      if (!enrollment) throw new NotFoundException();
      resource = { ownerId: enrollment.userId, instructorId: enrollment.course.instructorId };
    } else if (rule.resource === 'course') {
      const id = req.params['id'];
      const course =
        typeof id === 'string' ? await this.prisma.course.findUnique({ where: { id }, select: { instructorId: true } }) : null;
      if (!course) throw new NotFoundException();
      resource = { instructorId: course.instructorId };
    }

    const allowed = can(user, rule.action, resource);
    // requestLog가 이 값을 읽어 요청 로그에 기록한다. can()이 거부한 요청도 기록하도록, 403으로 응답하기 전에 아래 행을 실행한다.
    req.authz = { action: rule.action, allowed };
    if (!allowed) throw new ForbiddenException();
    return true;
  }
}
