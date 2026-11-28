import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';

// 공개 경로로 둘 핸들러나 컨트롤러에만 붙인다.
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
