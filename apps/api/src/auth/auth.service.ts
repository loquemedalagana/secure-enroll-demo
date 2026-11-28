import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { requireSecret } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './current-user.js';
import { hashPassword, verifyPassword } from './password.js';
import { TOKEN_TTL_SECONDS, issueToken, verifyToken } from './token.js';

export type LoginResult = { token: string; expiresIn: number };

@Injectable()
export class AuthService {
  private readonly secret = requireSecret('TOKEN_SECRET');
  // 존재하지 않는 아이디로 로그인을 요청했을 때 비밀번호와 비교하는 해시다. 아이디가 존재할 때와 같은 양의
  // 해시 계산을 하므로, 공격자는 응답 시간으로 아이디가 존재하는지 알 수 없다.
  private readonly dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(private readonly prisma: PrismaService) {}

  // 존재하지 않는 아이디와 잘못 입력한 비밀번호를 구분하지 않고 모두 401로 응답한다.
  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true },
    });
    const matched = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !matched) throw new UnauthorizedException();
    return { token: issueToken(user.id, this.secret), expiresIn: TOKEN_TTL_SECONDS };
  }

  // 토큰이 유효하면 토큰의 uid로 DB에서 사용자의 id와 role을 읽어 반환한다. role은 토큰이 아니라 DB에서 읽는다.
  // 그래서 role을 변경하거나 계정을 삭제하면 같은 토큰의 다음 요청부터 반영된다.
  async authenticate(token: string): Promise<AuthUser | null> {
    const payload = verifyToken(token, this.secret);
    if (!payload) return null;
    return this.prisma.user.findUnique({ where: { id: payload.uid }, select: { id: true, role: true } });
  }
}
