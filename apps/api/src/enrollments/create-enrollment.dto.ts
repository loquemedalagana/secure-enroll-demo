import { IsString, Length, Matches } from 'class-validator';

// 신청 생성의 request body다. CreateEnrollmentDto에 없는 필드가 포함된 요청은 전역 ValidationPipe가 400으로 거부한다.
// request body로는 신청자의 id를 받지 않는다. EnrollmentsController.create()가 토큰의 사용자(user.id)를 신청자로 정한다.
export class CreateEnrollmentDto {
  @IsString()
  @Length(1, 64)
  courseId!: string;

  // 개인정보(전화번호)의 예로 둔 필드다. 형식(010-0000-0000)만 확인한다.
  @IsString()
  @Matches(/^010-\d{4}-\d{4}$/)
  phone!: string;
}
