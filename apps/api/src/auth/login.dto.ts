import { IsString, Length } from 'class-validator';

// 여기 없는 필드가 오면 전역 ValidationPipe가 400으로 거부한다.
// 길이 상한은 비밀번호 해시 계산에 과도한 입력이 들어가는 것을 막는다.
export class LoginDto {
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
