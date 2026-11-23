import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { requireSecret } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { TOKEN_TTL_SECONDS, type TokenPayload, issueToken, verifyToken } from './token.js';

export type LoginResult = { token: string; expiresIn: number };

@Injectable()
export class AuthService {
  private readonly secret = requireSecret('TOKEN_SECRET');
  // 없는 아이디일 때 대신 비교할 해시. 아이디가 있을 때와 같은 양의 계산을 하게 해서
  // 응답 시간으로 아이디 존재 여부를 알 수 없게 한다.
  private readonly dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(private readonly prisma: PrismaService) {}

  // 아이디가 없을 때와 비밀번호가 틀릴 때를 구분하지 않고 같은 401을 낸다.
  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true },
    });
    const matched = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !matched) throw new UnauthorizedException();
    return { token: issueToken(user.id, this.secret), expiresIn: TOKEN_TTL_SECONDS };
  }

  verify(token: string): TokenPayload | null {
    return verifyToken(token, this.secret);
  }
}
