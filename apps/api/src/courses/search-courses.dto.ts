import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// 강의 목록 요청의 쿼리 문자열이다. SearchCoursesDto에 없는 필드가 포함된 요청은 전역 ValidationPipe가 400으로 거부한다.
// 이 검증은 검색어의 형식을 정하는 것이고 SQL 인젝션을 막는 조치가 아니다. 그 조치는 CoursesService.search에 있다.
export class SearchCoursesDto {
  // q를 두 번 보내면 배열이 되어 IsString에서 거부된다.
  // 널 바이트는 PostgreSQL이 문자열로 받지 않아 오류가 나므로 여기서 거부한다.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[^\0]*$/)
  q?: string;
}
