import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';

// 인증 없이 열어 둘 경로에만 붙인다.
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
