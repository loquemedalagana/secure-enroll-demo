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

// 인가 Guard. 인증 Guard 다음에 돈다.
// 핸들러가 @Authorize로 선언한 행위를 can()에 물어 보고, 허용이 아니면 403이다.
// 행위를 선언하지 않은 핸들러는 거부한다.
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

    if (!can(user, rule.action, resource)) throw new ForbiddenException();
    return true;
  }
}
