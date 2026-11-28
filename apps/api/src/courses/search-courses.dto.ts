import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// 강의 목록 요청의 쿼리 문자열이다. SearchCoursesDto에 없는 필드가 포함된 요청은 전역 ValidationPipe가 400으로 거부한다.
// 이 DTO는 q의 형식(문자열 하나, 100자 이하, 널 바이트 없음)을 확인한다. 이 확인을 통과한 q에도 작은따옴표가 포함될 수 있으므로,
// 이 검증으로는 SQL 인젝션 취약점이 없어지지 않는다. 결함 6은 CoursesService.search()가 q를 prepared statement의
// 플레이스홀더 값으로 넘기도록 고쳤고, 그 결과 취약점이 없어졌다.
export class SearchCoursesDto {
  // ?q=보안&q=실습처럼 q를 두 번 보내면 Express가 q를 배열(['보안', '실습'])로 읽는다.
  // 배열은 문자열이 아니므로 @IsString()이 이 요청을 거부한다.
  // q에 널 바이트가 포함되어 있으면 PostgreSQL에서 오류가 나고 API는 500으로 응답한다.
  // 그래서 API가 쿼리를 실행하기 전에 @Matches가 이 요청을 400으로 거부한다.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[^\0]*$/)
  q?: string;
}
