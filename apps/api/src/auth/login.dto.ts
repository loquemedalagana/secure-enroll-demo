import { IsString, Length } from 'class-validator';

// LoginDto에 없는 필드가 포함된 요청은 전역 ValidationPipe가 400으로 거부한다.
// 길이 상한(username 64자, password 128자)을 넘는 값도 전역 ValidationPipe가 400으로 거부한다.
// API가 긴 입력으로 scrypt 해시를 계산하기 전에 거부하기 위해서다.
export class LoginDto {
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
