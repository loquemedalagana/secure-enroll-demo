import { IsString, Length, Matches } from 'class-validator';

// 신청 생성의 본문. 여기 없는 필드가 오면 전역 ValidationPipe가 400으로 거부한다.
export class CreateEnrollmentDto {
  // 신청하는 사용자의 id
  @IsString()
  @Length(1, 64)
  userId!: string;

  @IsString()
  @Length(1, 64)
  courseId!: string;

  // 개인정보 예시 필드. 형식만 본다.
  @IsString()
  @Matches(/^010-\d{4}-\d{4}$/)
  phone!: string;
}
