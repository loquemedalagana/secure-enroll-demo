# 결함 6 진단 보고서: 강의 검색의 SQL 인젝션 (검색어를 SQL 문자열에 이어 붙임)

| 항목 | 내용 |
|---|---|
| 대상 | 태그 `v2-defect-6`의 코드로 로컬에서 띄운 API (`http://127.0.0.1:4000`) |
| 경로 | `GET /courses?q=` (공개 경로) |
| 분류 | OWASP Top 10 2025 A05 Injection / CWE-89 (SQL 인젝션) |
| 위험도 | 높음 |
| 해당 구성 요소 | 객체. 강의 검색이 읽어야 하는 테이블은 `courses`뿐입니다. 결함 상태에서는 공격자가 검색어에 넣은 SQL로 다른 객체(사용자 테이블, 신청 테이블)까지 읽을 수 있습니다. 시행 지점(PEP)인 Guard는 정상으로 동작합니다 |
| 상태 | 조치 완료 (`v2-fix-6`) |

## 1. 요약

강의 검색(`GET /courses?q=`)은 검색어를 SQL 문자열에 이어 붙여 실행합니다. 검색어에 작은따옴표가 들어 있으면 DB는 그 작은따옴표 뒤의 글자를 값이 아니라 쿼리의 일부로 실행합니다. 강의 검색은 공개 경로입니다. 그래서 공격자는 토큰 없이 테이블마다 요청 한 번으로 사용자 테이블의 계정 이름과 비밀번호 해시, 신청 테이블의 전화번호를 읽을 수 있습니다.

위험도를 높음으로 본 근거입니다.

| | 근거 |
|---|---|
| 높이는 쪽 | 인증이 필요 없습니다. 강의 검색은 공개 경로입니다 |
| 높이는 쪽 | 공격자는 요청 한 번으로 테이블 하나의 모든 행을 읽을 수 있습니다. 2절에서 사용자 테이블을 읽은 요청의 응답에는 계정 5개의 비밀번호 해시가, 신청 테이블을 읽은 요청의 응답에는 신청 3건의 전화번호가 들어 있습니다 |
| 높이는 쪽 | API는 이 요청에 200으로 응답하고, 응답의 필드(`id`, `title`)도 강의 목록과 같습니다. 그래서 상태 코드와 필드 이름만으로는 공격인지 알 수 없습니다 |
| 높이는 쪽 | API가 DB에 접속하는 계정이 모든 테이블을 읽을 수 있습니다. 강의 검색에 필요한 테이블은 `courses`뿐입니다 |
| 낮추는 쪽 | 응답에 포함된 비밀번호는 원문이 아니라 scrypt 해시입니다. 공격자가 원문을 알아내려면 해시마다 따로 비밀번호를 대입해야 합니다 |
| 낮추는 쪽 | 이 보고서는 공격자가 검색어로 다른 테이블을 읽을 수 있다는 것(기밀성 침해)만 확인했습니다. 검색어로 데이터를 변경하거나 삭제할 수 있는지는 확인하지 않았습니다 |

## 2. 재현 절차

준비:

```bash
git checkout v2-defect-6
docker compose up -d --wait
cd apps/api
cp .env.example .env
npm ci --ignore-scripts
npm run db:generate && npm run build
npm run db:migrate && npm run db:seed
npm start
```

요청 1 (정상 검색어 `보안`):

```bash
curl -s -G --data-urlencode "q=보안" http://127.0.0.1:4000/courses
```

```json
[{"id":"c1","title":"웹 보안 입문"}]
```

API는 제목에 "보안"이 포함된 강의 1건으로 응답합니다. 이 응답은 의도한 동작입니다.

요청 2 (작은따옴표 하나):

```bash
curl -s -G --data-urlencode "q='" http://127.0.0.1:4000/courses
```

```json
{"error":"internal_error"}
```

API는 500으로 응답합니다. DB는 검색어의 작은따옴표를 문자열 리터럴의 끝으로 읽습니다. 코드가 검색어 뒤에 붙인 `%'`의 작은따옴표는 짝이 없어서 SQL 문법 오류가 납니다. 결함이 없다면 DB는 작은따옴표를 검색할 글자로 읽고, API는 200과 빈 배열(`[]`)로 응답해야 합니다.

요청 3 (조건을 항상 참으로 만드는 검색어, tautology 기반):

```bash
curl -s -G --data-urlencode "q=암호학' OR '%'='" http://127.0.0.1:4000/courses
```

제목에 "암호학"이 포함된 강의는 없습니다. 그런데 API는 강의 2건이 모두 포함된 목록으로 응답합니다.

요청 4 (사용자 테이블의 행을 검색 결과에 합치는 검색어, UNION 기반):

```bash
curl -s -G --data-urlencode "q=암호학' UNION SELECT username, \"passwordHash\" FROM users --" http://127.0.0.1:4000/courses
```

API는 토큰 없는 이 요청에 200으로 응답하고, 응답에는 5건이 들어 있습니다(비밀번호 해시는 이 문서에서 가렸습니다).

```json
[
  {"id":"student2","title":"scrypt$<가림>"},
  {"id":"admin1","title":"scrypt$<가림>"},
  {"id":"instructor1","title":"scrypt$<가림>"},
  {"id":"student1","title":"scrypt$<가림>"},
  {"id":"instructor2","title":"scrypt$<가림>"}
]
```

응답의 `id` 필드에는 계정 이름이, `title` 필드에는 비밀번호 해시가 들어 있습니다. 검색어의 `UNION SELECT` 뒤를 `id, phone FROM enrollments --`로 바꿔 요청하면, API는 신청 3건의 신청 id와 전화번호로 응답합니다.

재현 스크립트 (`main`의 스크립트를 결함 상태의 API에 실행):

```bash
node .github/scripts/defects/defect-6.mjs
```

```
결함 6: 강의 검색(GET /courses?q=)의 검색어 처리
대상: http://127.0.0.1:4000
- 검색어: 암호학 (토큰 없음, 0건이어야 함)
    → 상태 200 · 0건
- 검색어: 작은따옴표 하나 (')
    → 상태 500 · 0건
- 검색어: 암호학' OR '%'='
    → 상태 200 · 2건 · 강의 2건
- 검색어: 암호학' UNION SELECT … FROM users
    → 상태 200 · 5건 · 사용자 테이블에서 온 행 5건(계정 이름과 비밀번호 해시)
- 검색어: 암호학' UNION SELECT … FROM enrollments
    → 상태 200 · 3건 · 신청 테이블에서 온 행 3건(신청 id와 전화번호)
판정: 취약
```

스크립트는 응답의 값을 출력하지 않습니다. 상태 코드와 응답에 포함된 행의 건수만 출력합니다. 결함이 없다면 API는 다섯 요청 모두에 200과 빈 배열(`[]`)로 응답해야 합니다. 강의 2건의 제목(`웹 보안 입문`, `시큐어 코딩 실습`)에는 다섯 검색어 중 어느 것도 글자 그대로 들어 있지 않기 때문입니다.

## 3. 원인

API는 검색어를 SQL 문자열에 이어 붙여 문자열 하나로 만든 뒤 DB에 보냅니다. DB는 이 문자열 하나를 구문 분석하므로, 어디까지가 코드에 적힌 쿼리이고 어디부터가 검색어인지 구분할 수 없습니다.

```mermaid
flowchart LR
  req(["GET /courses<br/>?q=검색어<br/>토큰 없음"])

  subgraph api["API"]
    g["인증·인가 Guard<br/>공개 경로의 요청을<br/>통과시킴"]
    s["강의 검색<br/>검색어를 SQL 문자열에<br/>이어 붙임"]
  end

  subgraph db["PostgreSQL"]
    c[("courses<br/>제목")]
    u[("users<br/>비밀번호 해시")]
    e[("enrollments<br/>전화번호")]
  end

  req --> g --> s
  s -- "제목 검색" --> c
  s -- "검색어에 포함된<br/>UNION SELECT" --> u
  s -- "검색어에 포함된<br/>UNION SELECT" --> e
  s --> res(["200 · 강의 목록과<br/>같은 모양의 응답"])

  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  class g,c safe
  class s,u,e danger
  style api fill:none,stroke:#57606a
  style db fill:none,stroke:#57606a
  linkStyle 3,4 stroke:#A32D2D,stroke-width:2px
```

- 빨간색 상자는 검색어를 SQL 문자열에 이어 붙이는 강의 검색과, 그 쿼리가 읽는 `users` 테이블과 `enrollments` 테이블을 나타냅니다.
- 빨간색 화살표는 검색어에 포함된 `UNION SELECT`가 `users` 테이블과 `enrollments` 테이블을 읽는 흐름을 나타냅니다.
- 초록색 상자는 정상으로 동작하는 Guard와, 강의 검색이 읽는 `courses` 테이블을 나타냅니다.

강의 목록은 의도한 공개 경로입니다. 강의 목록 핸들러에 `@Public()`이 붙어 있어서([`courses/courses.controller.ts` 12행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.controller.ts#L12)), Guard는 토큰 확인을 건너뛰고 요청을 통과시킵니다. Guard의 이 동작은 정상입니다.

### 3.1 원인 코드

- `search()`는 템플릿 문자열의 `'%${q}%'`로 검색어 `q`를 SQL 문자열에 넣고(19행), 이 문자열을 `$queryRawUnsafe`로 실행합니다(18행): [`courses/courses.service.ts` 17~21행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.service.ts#L17-L21).
- 강의 목록 핸들러 `list()`는 주소의 쿼리 문자열에서 읽은 `q`를 `this.courses.search(q)`에 그대로 넘깁니다: [`courses/courses.controller.ts` 15행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.controller.ts#L15).

### 3.2 검색어에 따라 실행되는 쿼리

19행의 코드가 만드는 쿼리는 `… WHERE title ILIKE '%` + 검색어 + `%' ORDER BY id ASC`입니다. 아래 표에서 굵은 부분이 검색어입니다.

| 검색어 | 실행되는 쿼리의 조건 부분 | 결과 |
|---|---|---|
| `보안` | `title ILIKE '%`**`보안`**`%' ORDER BY …` | API는 제목에 "보안"이 포함된 강의 1건으로 응답합니다. 의도한 동작입니다 |
| `'` | `title ILIKE '%`**`'`**`%' ORDER BY …` | DB가 검색어의 `'`를 문자열 리터럴의 끝으로 읽습니다. 뒤에 남은 `'`는 짝이 없어서 문법 오류가 나고, API는 500으로 응답합니다 |
| `암호학' OR '%'='` | `title ILIKE '%`**`암호학' OR '%'='`**`%' ORDER BY …` | `'%'='%'`가 항상 참이어서 API는 모든 강의로 응답합니다 (tautology 기반) |
| `암호학' UNION SELECT username, "passwordHash" FROM users --` | `title ILIKE '%`**`암호학' UNION SELECT … FROM users --`**`%' ORDER BY …` | DB는 `--` 뒤를 주석으로 읽고, 사용자 테이블의 행을 검색 결과에 합칩니다 (UNION 기반) |

### 3.3 이 결함을 처음 잡은 테스트

결함 태그(`v2-defect-6`)에는 이 결함을 잡는 테스트가 없습니다. 이 태그에서 API 테스트 94건이 모두 통과합니다. 강의 검색 테스트 2건([`apps/api/test/courses.test.mjs` 30~39행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/test/courses.test.mjs#L30-L39))은 검색어로 `보안`, `실습`, `없는 제목`, 빈 문자열만 보냅니다.

### 3.4 결함을 잡는 테스트

`apps/api/test/courses.test.mjs`에 테스트 5건("강의 검색 1~5")을 추가했습니다([`d8eb300`](https://github.com/loquemedalagana/secure-enroll-demo/commit/d8eb300)). 테스트는 API를 띄운 뒤 웹을 거치지 않고 API에 직접 요청합니다. API는 실제 PostgreSQL에 접속합니다. mock은 쿼리를 구문 분석하지 않고 미리 정한 값을 반환합니다. 그래서 PostgreSQL을 mock으로 바꾸면 검색어의 작은따옴표가 쿼리를 바꾸는지 테스트로 확인할 수 없습니다.

```mermaid
flowchart LR
  req(["테스트의 요청<br/>GET /courses<br/>?q=검색어<br/>토큰 없음"])

  subgraph api["API"]
    s["강의 검색"]
  end

  subgraph db["PostgreSQL"]
    u[("users")]
    c[("courses")]
    e[("enrollments")]
  end

  res(["응답"])

  req --> s
  s == "비밀번호 해시" ==> u
  s --> c
  s == "전화번호" ==> e
  s --> res

  t1["테스트 1<br/>검색어의 작은따옴표가<br/>SQL 문법 오류를<br/>일으키지 않는가"] -.- s
  u -.- t3["테스트 3<br/>검색어로 사용자 테이블을<br/>읽을 수 없는가"]
  c -.- t2["테스트 2<br/>검색어가 조건을<br/>항상 참으로<br/>바꾸지 못하는가"]
  e -.- t4["테스트 4<br/>검색어로 신청 테이블을<br/>읽을 수 없는가"]
  res -.- t5["테스트 5<br/>응답의 모든 행이<br/>제목에 검색어가<br/>포함된 강의인가"]

  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef test fill:#E6F1FB,stroke:#185FA5,color:#0C2D50
  class s,u,e danger
  class c safe
  class t1,t2,t3,t4,t5 test
  style api fill:none,stroke:#57606a
  style db fill:none,stroke:#57606a
  linkStyle 1,3 stroke:#A32D2D,stroke-width:3px
```

- 빨간색 상자는 검색어를 SQL 문자열에 이어 붙이는 강의 검색과, 그 쿼리가 읽는 `users` 테이블과 `enrollments` 테이블을 나타냅니다.
- 빨간색 화살표는 결함 상태에서 강의 검색이 `users` 테이블의 비밀번호 해시와 `enrollments` 테이블의 전화번호를 읽는 흐름을 나타냅니다.
- 초록색 상자는 강의 검색이 읽는 `courses` 테이블을 나타냅니다.
- 파란색 상자는 테스트를 나타냅니다.

| 테스트 | 보내는 검색어 | 개발 관점: 무엇을 확인하나 | 보안 관점: 무엇을 지키나 |
|---|---|---|---|
| 1 작은따옴표가 포함된 검색어도 오류 없이 200에 0건 | `'` | API가 작은따옴표 하나인 검색어에 200과 빈 배열(`[]`)로 응답하는지 | 검색어의 작은따옴표가 SQL 문법 오류를 일으키지 않는가. 공격자는 API의 500 응답으로 검색어가 쿼리의 일부로 실행된다는 것을 확인할 수 있습니다 |
| 2 검색어로 조건을 항상 참으로 만들 수 없음 | `암호학' OR '%'='` | API가 이 검색어에 200과 빈 배열(`[]`)로 응답하는지 | 검색어가 `WHERE` 조건을 항상 참으로 바꾸지 못하는가 (tautology 기반) |
| 3 검색어로 사용자 테이블을 읽을 수 없음 | `… UNION SELECT … FROM users --` | API가 이 검색어에 200과 빈 배열(`[]`)로 응답하는지 | 기밀성. 공격자가 검색어로 사용자 테이블의 계정 이름과 비밀번호 해시를 읽을 수 없는가 (UNION 기반) |
| 4 검색어로 신청 테이블을 읽을 수 없음 | `… UNION SELECT … FROM enrollments --` | API가 이 검색어에 200과 빈 배열(`[]`)로 응답하는지 | 기밀성. 공격자가 검색어로 신청 테이블의 전화번호를 읽을 수 없는가 (UNION 기반) |
| 5 어떤 검색어든 응답의 모든 행은 제목에 그 검색어가 포함된 강의 | 정상 검색어 `보안`과 테스트 1~4의 검색어 4개 | API의 검색 응답이, 강의 전체 목록에서 제목에 검색어가 포함된 강의만 고른 결과와 같은지 | 기밀성. 공격자가 어떤 검색어를 보내도 강의 목록(`GET /courses`)에 없는 행을 읽을 수 없는가 |

테스트 1~4는 SQL 인젝션에 쓰는 검색어를 하나씩 보내 API의 응답을 확인합니다. 테스트 5는 검색어가 무엇이든 성립해야 하는 조건을 확인합니다. 테스트 5는 `GET /courses`로 강의 전체 목록을 조회해 제목에 검색어가 포함된 강의만 고릅니다([`apps/api/test/courses.test.mjs` 90행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-fix-6/apps/api/test/courses.test.mjs#L90)). 그리고 검색 응답에 이 강의가 아닌 행이 없는지([91~92행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-fix-6/apps/api/test/courses.test.mjs#L91-L92)), 검색 응답의 건수가 고른 강의의 수와 같은지([93행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-fix-6/apps/api/test/courses.test.mjs#L93)) 확인합니다.

이 커밋에서 API 테스트는 99건 중 94건이 통과하고 5건이 실패합니다.

```
✖ 강의 검색 1: 작은따옴표가 든 검색어도 오류 없이 200에 0건
✖ 강의 검색 2: 검색어로 조건을 항상 참으로 만들 수 없음
✖ 강의 검색 3: 검색어로 사용자 테이블을 읽을 수 없음
✖ 강의 검색 4: 검색어로 신청 테이블을 읽을 수 없음
✖ 강의 검색 5: 어떤 검색어든 응답의 모든 행은 제목에 그 검색어가 든 강의
```

"강의 검색 1~5"는 `assert.deepEqual`로 response body를 기댓값과 비교하지 않습니다. `assert.deepEqual`은 실패할 때 비교한 두 값을 테스트 로그에 기록하고, 결함 상태의 response body에는 비밀번호 해시와 전화번호가 들어 있습니다. 대신 `assert.equal`로 상태 코드와 행의 수만 비교합니다. 데이터를 변경하거나 삭제하는 SQL이 포함된 검색어는 테스트에 넣지 않았습니다. 결함 상태에서는 DB가 그 SQL을 실제로 실행할 수 있고, 다른 테스트가 같은 DB를 쓰기 때문입니다.

### 3.5 보안 관점: 접근통제 구성 요소로 본 결함

| 구성 요소 | 이 결함에서 | 코드에서 확인하는 곳 |
|---|---|---|
| 주체 | 토큰 없이 요청한 사람. 인증 Guard가 18행에서 `true`를 반환해서 `authenticate(token)`(24행)은 실행되지 않습니다 | [`auth/auth.guard.ts` 18행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/auth/auth.guard.ts#L18) |
| 객체 | 강의 목록(강의의 id와 제목). 강의 목록 핸들러가 반환하는 `CourseView`에는 `id`와 `title`만 있습니다([`courses/courses.service.ts` 6행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.service.ts#L6)). **`search()`가 검색어를 SQL 문자열에 이어 붙입니다. 이 부분이 결함이고, 그 결과 공격자가 검색어에 넣은 SQL로 사용자 테이블과 신청 테이블까지 읽을 수 있는 취약점(SQL 인젝션)이 생깁니다** | [`courses/courses.service.ts` 17~21행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.service.ts#L17-L21) |
| 시행 (PEP) | 정상으로 동작합니다. 강의 목록 핸들러에 `@Public()`이 붙어 있어서, 인증 Guard와 인가 Guard는 `isPublic()`이 `true`를 반환하는 이 요청을 통과시킵니다 | [`courses/courses.controller.ts` 12행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.controller.ts#L12), [`auth/auth.guard.ts` 18행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/auth/auth.guard.ts#L18), [`authz/authz.guard.ts` 27행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/authz/authz.guard.ts#L27) |
| 판단 (PE) | 인가 Guard가 27행에서 `true`를 반환해서 `can()`을 호출하는 59행은 실행되지 않습니다. 공개 경로이므로 의도한 동작입니다 | [`authz/authz.guard.ts` 59행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/authz/authz.guard.ts#L59) |

결함 1과 결함 2는 시행 지점(PEP)인 Guard에 결함이 있었습니다. 결함 1에서는 관리자 컨트롤러에 Guard가 적용되지 않았고, 결함 2에서는 Guard가 토큰 확인을 건너뛰었습니다. 결함 6에서는 Guard가 정상으로 동작합니다. Guard는 요청이 라우팅된 핸들러에 붙은 `@Public`과 `@Authorize`를 읽어 요청을 통과시킬지 판단합니다. 핸들러가 실행하는 쿼리가 어느 테이블을 읽는지는 확인하지 않습니다. 신청 한 건 조회(`GET /enrollments/:id`)에서 `can()`은 신청자, 담당 강사, 관리자의 요청만 허용합니다([`authz/policy.ts` 32~37행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/authz/policy.ts#L32-L37)). 그런데 공격자는 신청 테이블에 저장된 전화번호를 공개 경로인 강의 검색으로 읽을 수 있습니다.

## 4. 조치

### 4.1 조치 방안 비교

고칠 곳은 `apps/api/src/courses/courses.service.ts`의 `search()`입니다. 고칠 방법은 세 가지입니다.

- **방안 1 (따옴표 이스케이프)**: `q.replaceAll("'", "''")`로 검색어의 작은따옴표 하나를 두 개로 바꾼 뒤, 결함 상태와 같이 SQL 문자열에 이어 붙입니다.
- **방안 2 (prepared statement)**: 쿼리에는 값 대신 플레이스홀더(`$1`)를 두고, 검색어는 쿼리와 따로 DB에 보냅니다. Prisma의 `$queryRaw` 태그드 템플릿을 씁니다.
- **방안 3 (쿼리 빌더)**: raw 쿼리(SQL을 코드에 직접 적어 실행하는 쿼리, `$queryRaw`와 `$queryRawUnsafe`)를 쓰지 않고 Prisma의 `findMany`와 `contains`로 검색합니다.

#### 방안마다 검색어가 거치는 단계

DB는 API가 보낸 쿼리를 두 단계로 처리합니다.

| 단계 | 하는 일 |
|---|---|
| ① 구문 분석(파싱) | DB는 API가 보낸 쿼리에서 어느 부분이 명령이고 어느 부분이 값인지를 정합니다 |
| ② 실행 | DB가 ①에서 정한 구조대로 테이블을 읽습니다 |

SQL 인젝션은 ①에서 일어납니다. 검색어가 SQL 문자열에 들어 있으면 DB는 ①에서 검색어의 일부를 값이 아니라 명령으로 읽습니다. 세 방안은 검색어가 ①을 거치는지가 다릅니다.

```mermaid
flowchart LR
  subgraph one["결함 상태, 방안 1"]
    a1["API<br/>쿼리와 검색어를<br/>문자열 하나로 만들어 보냄"]
    p1["① 구문 분석<br/>DB가 검색어도 함께 읽어<br/>구조를 정함"]
    e1["② 실행"]
    a1 -- "쿼리 + 검색어" --> p1 --> e1
  end

  subgraph two["방안 2, 방안 3"]
    a2["API<br/>쿼리와 검색어를<br/>따로 보냄"]
    p2["① 구문 분석<br/>DB가 쿼리만 읽어<br/>구조를 정함"]
    e2["② 실행<br/>DB가 검색어를<br/>값으로만 씀"]
    a2 -- "쿼리 (플레이스홀더 $1)" --> p2 --> e2
    a2 -- "검색어" --> e2
  end

  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef neutral fill:#f6f8fa,stroke:#57606a,color:#24292f
  class p1 danger
  class p2,e2 safe
  class a1,e1,a2 neutral
  style one fill:none,stroke:#57606a
  style two fill:none,stroke:#57606a
  linkStyle 0 stroke:#A32D2D,stroke-width:2px
```

| 방안 | 검색어가 ①을 거치는가 | 안전한 이유 | 안전하지 않게 되는 때 |
|---|---|---|---|
| 1 | 거칩니다 | 코드가 검색어의 `'`를 `''`로 바꿉니다. DB는 구문 분석할 때 `''`를 문자열 리터럴 안의 작은따옴표 한 글자로 읽습니다 | DB의 문자열 리터럴 이스케이프 규칙이 `''` 말고 다른 표기(`\'`)도 허용할 때. 값을 SQL 문자열에 넣는 곳 중 한 곳이라도 `replaceAll`을 적용하지 않았을 때. 값을 작은따옴표로 감싸지 않는 곳(숫자)에 넣을 때 |
| 2 | 거치지 않습니다 | DB는 `$1`이 포함된 쿼리만 구문 분석해 구조를 정합니다. API는 검색어를 `$1`의 값으로 따로 보내고, DB는 ②에서 이 값을 씁니다 | 플레이스홀더로 값을 넘기는 곳에서는 없습니다 |
| 3 | 거치지 않습니다 | 방안 2와 같습니다. 쿼리는 Prisma가 만듭니다 | 방안 2와 같습니다 |

방안 2의 코드는 결함이 있는 코드와 비슷합니다. 결함이 있는 코드는 `$queryRawUnsafe(…)`의 괄호 안에 템플릿 문자열을 넘기고, 방안 2의 코드는 `$queryRaw` 뒤에 괄호 없이 템플릿을 붙여 씁니다.

```ts
this.prisma.$queryRawUnsafe(`… ILIKE '%${q}%' …`)  // 결함: 문자열이 먼저 완성된 뒤 함수로 넘어갑니다
this.prisma.$queryRaw`… ILIKE ${`%${q}%`} …`       // 방안 2: 쿼리의 문자열 부분과 값이 따로 함수로 넘어갑니다
```

함수 이름 뒤에 괄호 없이 템플릿을 붙여 쓰는 문법을 태그드 템플릿(tagged template)이라고 합니다. 태그드 템플릿에서 자바스크립트는 `${}` 안의 값을 문자열에 넣지(보간, interpolation) 않고, 템플릿의 문자열 부분들과 `${}` 안의 값들을 따로 함수에 넘깁니다. Prisma는 `${}`가 있던 곳에 플레이스홀더 `$1`을 넣은 쿼리와 값을 DB에 따로 보냅니다. 플레이스홀더로는 값만 넘길 수 있습니다. 테이블 이름이나 정렬 방향은 플레이스홀더로 넘길 수 없습니다.

#### 실제로 바꿔 본 결과

세 방안을, 결함을 잡는 테스트를 추가한 뒤의 코드에 하나씩 적용해 결과를 비교했습니다. 방안을 하나 적용할 때마다 `npm test`로 API 테스트를 실행하고 재현 스크립트를 실행했습니다. 세 방안의 변경은 커밋하지 않았습니다. API가 DB에 보낸 쿼리는 PostgreSQL의 로그로 확인했습니다. 이 확인에 쓴 API의 DB 연결에만 `log_statement=all`을 설정했습니다.

방안 1:

```diff
+    const escaped = q.replaceAll("'", "''");
     return this.prisma.$queryRawUnsafe<CourseView[]>(
-      `SELECT id, title FROM courses WHERE title ILIKE '%${q}%' ORDER BY id ASC`,
+      `SELECT id, title FROM courses WHERE title ILIKE '%${escaped}%' ORDER BY id ASC`,
     );
```

방안 2:

```diff
-    return this.prisma.$queryRawUnsafe<CourseView[]>(
-      `SELECT id, title FROM courses WHERE title ILIKE '%${q}%' ORDER BY id ASC`,
-    );
+    return this.prisma.$queryRaw<CourseView[]>`
+      SELECT id, title FROM courses WHERE title ILIKE ${`%${q}%`} ORDER BY id ASC`;
```

방안 3:

```diff
-    return this.prisma.$queryRawUnsafe<CourseView[]>(
-      `SELECT id, title FROM courses WHERE title ILIKE '%${q}%' ORDER BY id ASC`,
-    );
+    return this.prisma.course.findMany({
+      where: { title: { contains: q, mode: 'insensitive' } },
+      select: { id: true, title: true },
+      orderBy: { id: 'asc' },
+    });
```

| 확인 | 결함 상태 | 방안 1 | 방안 2 | 방안 3 |
|---|---|---|---|---|
| API 테스트 99건 | 5건 실패 | 모두 통과 | 모두 통과 | 모두 통과 |
| 재현 스크립트 판정 | 취약 | 차단 | 차단 | 차단 |
| 검색어가 DB로 가는 방식 | SQL 문자열 안 | **SQL 문자열 안** | 플레이스홀더 `$1`의 값 | 플레이스홀더 `$1`의 값 |
| DB 설정 `standard_conforming_strings=off`에서 `\' UNION SELECT … FROM users --` | (확인하지 않음) | **사용자 테이블 5건** | 0건 | (확인하지 않음) |

`UNION SELECT … FROM users`가 포함된 검색어를 보냈을 때 PostgreSQL 로그에 남은 줄은 다음과 같습니다.

```
결함     statement: SELECT id, title FROM courses WHERE title ILIKE '%암호학' UNION SELECT username, "passwordHash" FROM users --%' ORDER BY id ASC
방안 1   statement: SELECT id, title FROM courses WHERE title ILIKE '%암호학'' UNION SELECT username, "passwordHash" FROM users --%' ORDER BY id ASC
방안 2   execute <unnamed>: SELECT id, title FROM courses WHERE title ILIKE $1 ORDER BY id ASC
         Parameters: $1 = '%암호학'' UNION SELECT username, "passwordHash" FROM users --%'
방안 3   execute <unnamed>: SELECT "public"."courses"."id", "public"."courses"."title" FROM "public"."courses" WHERE "public"."courses"."title" ILIKE ('%' || $1 || '%') ORDER BY "public"."courses"."id" ASC OFFSET $2
         Parameters: $1 = '암호학'' UNION SELECT username, "passwordHash" FROM users --', $2 = '0'
```

위의 표와 로그에서 확인할 것은 세 가지입니다.

- 방안 1도 이 저장소의 DB 설정에서는 결함을 고칩니다. API 테스트 99건이 모두 통과하고 재현 스크립트는 "차단"으로 판정합니다.
- 방안 1에서는 검색어가 여전히 SQL 문자열 안에 있습니다. 로그의 `statement:`는 API가 쿼리와 검색어를 문자열 하나로 만들어 보냈다는 것을 뜻합니다. 방안 2와 3의 `execute <unnamed>`와 `Parameters:`는 API가 쿼리와 값을 따로 보냈다는 것을 뜻합니다. PostgreSQL은 플레이스홀더가 포함된 쿼리를 먼저 구문 분석해 이름 없는 prepared statement로 준비하고, 그 뒤에 값을 받아 실행합니다. 그래서 PostgreSQL이 쿼리를 구문 분석할 때 검색어는 쿼리 안에 없습니다.
- 방안 1이 안전한지는 DB의 이스케이프 규칙에 달려 있습니다. 확인에 쓴 DB 연결에서 `standard_conforming_strings`를 `off`로 설정하면 PostgreSQL은 문자열 리터럴 안의 역슬래시를 이스케이프 문자로 읽습니다. 검색어 `\' UNION SELECT … FROM users --`를 보내면 방안 1의 코드는 `\'`를 `\''`로 바꿉니다. PostgreSQL은 `\'`를 문자열 안의 작은따옴표 한 글자로 읽고, 코드가 추가한 두 번째 `'`를 문자열 리터럴의 끝으로 읽습니다. 그래서 방안 1의 코드에서 SQL 인젝션이 다시 성공했고, 응답에는 사용자 테이블의 행 5건이 들어 있었습니다. `standard_conforming_strings`의 기본값은 `on`이고 이 저장소의 DB(PostgreSQL 18.7)도 `on`입니다. 방안 2의 코드는 `off`에서도 0건으로 응답했습니다.

세 방안을 적용한 뒤에도 똑같이 남는 동작 세 가지를 확인했습니다. 세 가지는 와일드카드(`%`, `_`), 널 바이트, `q`를 두 번 보낸 요청입니다. 세 가지 모두 공격자가 다른 테이블을 읽을 수 있게 하는 동작이 아니어서 결함 6과 따로 다룹니다. 세 가지는 수정 태그 뒤의 커밋에서 고쳤습니다(4.3절).

| 검색어 | 결함 상태 | 방안 1 | 방안 2 | 방안 3 |
|---|---|---|---|---|
| `%` | 200, 2건 | 200, 2건 | 200, 2건 | 200, 2건 |
| `_` | 200, 2건 | 200, 2건 | 200, 2건 | 200, 2건 |
| 널 바이트 (`%00`) | 500 | 500 | 500 | 500 |
| `q`를 두 번 (`?q=보안&q=실습`) | 200, 0건 | 200, 0건 | 200, 0건 | 200, 0건 |

`%`와 `_`는 `LIKE`의 와일드카드라서 API는 모든 강의로 응답합니다. 방안 3의 `contains`도 `%`와 `_`를 이스케이프하지 않고 DB에 넘깁니다. PostgreSQL은 널 바이트가 포함된 문자열을 받지 않아서 오류를 내고, API는 500으로 응답합니다. `q`를 두 번 보내면 API는 두 값을 쉼표로 이은 문자열 하나(`보안,실습`)로 검색합니다.

#### 비교

| 기준 | 방안 1 (따옴표 이스케이프) | 방안 2 (prepared statement) | 방안 3 (쿼리 빌더) |
|---|---|---|---|
| 바꾸는 줄 | 2줄 | 3줄 | 5줄 |
| API가 쿼리와 검색어를 DB에 보내는 방식 | 문자열 하나로 만들어 보냅니다 | 따로 보냅니다 | 따로 보냅니다 |
| 안전한 근거 | 코드가 작은따옴표를 모두 `''`로 바꾸고, DB의 이스케이프 규칙이 `''`만 허용해야 합니다 | DB가 쿼리를 구문 분석할 때 검색어가 쿼리 안에 없습니다 | 방안 2와 같습니다 |
| DB 설정이 바뀌면 | SQL 인젝션이 다시 성공합니다 (위에서 확인) | 영향이 없습니다 (위에서 확인) | 확인하지 않음 |
| SQL을 직접 쓰는가 | 씁니다 | 씁니다 | 쓰지 않습니다 |
| 실행되는 쿼리 | DB가 코드에 적힌 쿼리를 그대로 실행합니다 | DB가 코드에 적힌 쿼리를 그대로 실행합니다 | Prisma가 쿼리를 만듭니다 (`OFFSET $2`가 붙습니다) |
| SQL 인젝션 취약점이 다시 생길 수 있는 코드 | 코드에 `$queryRawUnsafe`가 남습니다 | 코드에 `$queryRawUnsafe`는 남지 않고 raw 쿼리(`$queryRaw`)는 남습니다 | 코드에 raw 쿼리가 남지 않습니다 |

**고른 것**: 방안 2 (prepared statement).

**이유**: 이 결함의 원인은 작은따옴표 하나가 아니라, API가 쿼리와 검색어를 문자열 하나로 만들어 DB에 보내고 DB가 그 문자열 전체를 구문 분석하는 구조입니다. 방안 2에서는 API가 쿼리와 검색어를 따로 보내므로 DB가 검색어를 구문 분석하지 않습니다. 방안 1은 쿼리와 검색어를 문자열 하나로 보내는 구조를 그대로 두고 검색어의 작은따옴표만 바꿉니다. 그래서 방안 1이 안전한지는 DB의 이스케이프 규칙에 달려 있습니다. `standard_conforming_strings`를 `off`로 설정하자 방안 1에서는 SQL 인젝션이 다시 성공했고, 방안 2는 0건으로 응답했습니다.

**채택하지 않은 대안 (방안 1)**: 방안 1은 이 저장소의 DB 설정에서는 결함을 고칩니다. 그런데 방안 1이 안전한지는 DB의 이스케이프 규칙에 달려 있습니다. 개발자는 값을 SQL 문자열에 넣는 곳마다 `replaceAll`을 적용해야 하고, 한 곳이라도 적용하지 않으면 그 곳에서 SQL 인젝션이 성공합니다. 값을 작은따옴표로 감싸지 않는 곳(숫자)에는 이 방법을 쓸 수 없습니다.

**채택하지 않은 대안 (방안 3)**: 방안 3은 안전한 이유가 방안 2와 같습니다. 코드에 raw 쿼리가 남지 않으므로, 세 방안 중에서 SQL 인젝션 취약점이 다시 생길 수 있는 코드가 가장 적습니다. 강의 검색 하나만 고친다면 방안 3이 방안 2보다 낫습니다. 그래도 방안 2를 고른 이유는 이 저장소가 결함과 조치를 보여 주는 데모이기 때문입니다. 방안 2에서는 수정 전과 후의 SQL이 같고 검색어를 넘기는 방식만 다릅니다. 그래서 4.2절의 diff에서 결함과 조치의 차이를 바로 확인할 수 있습니다.

**감수하는 것**:

- 코드에 raw 쿼리가 남습니다. `search()`의 `$queryRaw`를 `$queryRawUnsafe`로 되돌리면 SQL 인젝션 취약점이 다시 생깁니다. `$queryRawUnsafe`로 되돌린 코드에서는 3.4절의 테스트 5건("강의 검색 1~5")이 실패하고, CI의 `api` 잡이 실패합니다. `search()` 위에는 `$queryRawUnsafe`로 바꾸지 않는다는 주석을 달았습니다([`courses/courses.service.ts` 17행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-fix-6/apps/api/src/courses/courses.service.ts#L17)).
- 검색어의 `%`와 `_`는 와일드카드로 동작합니다. API는 널 바이트가 포함된 검색어에 500으로 응답합니다. `q`를 두 번 보내면 API는 두 값을 쉼표로 이은 문자열로 검색합니다. 세 가지 동작은 수정 태그(`v2-fix-6`)의 코드에 남아 있고, 수정 태그 뒤의 커밋에서 고쳤습니다(4.3절).
- API가 DB에 접속하는 계정은 조치 뒤에도 모든 테이블을 읽을 수 있습니다.

**채택하지 않은 대안 (클라이언트 측 입력값 검증)**: 웹의 검색 화면이 브라우저에서 작은따옴표가 포함된 검색어를 보내지 않게 하는 방법입니다. 그런데 공격자는 검색 화면을 거치지 않고 `curl`이나 스크립트로 API에 직접 요청할 수 있습니다.

```mermaid
flowchart LR
  b(["브라우저의 검색 화면<br/>클라이언트 측<br/>입력값 검증"])
  d(["curl, Postman,<br/>스크립트"])
  w["웹"]
  a["API<br/>강의 검색"]
  db[("PostgreSQL")]

  b --> w --> a
  d -- "검색 화면을 거치지 않음" --> a
  a --> db

  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef neutral fill:#f6f8fa,stroke:#57606a,color:#24292f
  class a danger
  class b safe
  class d,w,db neutral
  linkStyle 2 stroke:#A32D2D,stroke-width:2px
```

클라이언트 측 입력값 검증은 사용자가 검색 화면에서 입력해 보낸 요청에만 적용됩니다. 2절의 재현 요청은 모두 검색 화면을 거치지 않고 `curl`로 API에 직접 보냈습니다. 지금은 웹에 검색 화면이 없어서, 강의를 검색하려면 누구나 API에 직접 요청해야 합니다(그림의 아래쪽 흐름). 웹에 검색 화면을 추가한 뒤에도 공격자는 API에 직접 요청할 수 있습니다. 그래서 결함 6은 API의 코드에서 고쳐야 합니다. 클라이언트 측 입력값 검증은 사용자에게 잘못 입력한 값을 알려 주는 데 쓸 수 있습니다.

**채택하지 않은 대안 (검색어에서 글자나 단어를 걸러 내기)**: API가 `'`, `--`, `UNION`이 포함된 검색어를 거부하는 방법입니다. 이 방법을 쓰면 사용자는 제목에 작은따옴표가 포함된 강의를 검색할 수 없습니다. 거부할 글자와 단어의 목록에 없는 표기로 쓴 검색어는 API가 거부하지 못합니다. API가 쿼리와 검색어를 문자열 하나로 만들어 DB에 보내는 원인도 그대로 남습니다.

**이 PR에서 하지 않는 것 (DB 계정에 최소 권한 적용)**: API가 DB에 접속하는 계정은 모든 테이블을 읽을 수 있습니다. 강의 검색에 필요한 테이블은 `courses`뿐입니다. 그런데 API는 같은 계정으로 로그인과 신청 조회도 처리합니다. 그래서 강의 검색에 최소 권한을 적용하려면 `courses`만 읽을 수 있는 DB 계정을 따로 만들어야 합니다. 최소 권한을 적용해도 결함 6은 코드에 남습니다. 최소 권한을 적용하면 SQL 인젝션이 성공했을 때 공격자가 읽을 수 있는 테이블이 `courses` 하나로 줄어듭니다(피해 범위).

### 4.2 적용한 조치

방안 2를 커밋 하나([`085f3a4`](https://github.com/loquemedalagana/secure-enroll-demo/commit/085f3a4))로 적용했습니다. 태그 `v2-fix-6`이 이 커밋을 가리킵니다. 고친 곳은 `search()` 하나입니다: [`courses/courses.service.ts` 17~21행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-fix-6/apps/api/src/courses/courses.service.ts#L17-L21).

```diff
+  // 검색어는 쿼리 문자열에 넣지 않고 매개변수로 넘긴다. $queryRawUnsafe로 바꾸지 않는다.
   search(q: string): Promise<CourseView[]> {
-    return this.prisma.$queryRawUnsafe<CourseView[]>(
-      `SELECT id, title FROM courses WHERE title ILIKE '%${q}%' ORDER BY id ASC`,
-    );
+    return this.prisma.$queryRaw<CourseView[]>`
+      SELECT id, title FROM courses WHERE title ILIKE ${`%${q}%`} ORDER BY id ASC`;
   }
```

SQL은 수정 전과 같고, 검색어를 DB에 넘기는 방식만 바꿨습니다. 검색어 앞뒤의 `%`는 쿼리가 아니라 값에 붙였습니다([20행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-fix-6/apps/api/src/courses/courses.service.ts#L20)). 쿼리에 `'%$1%'`라고 쓰면 DB는 작은따옴표 안의 `$1`을 플레이스홀더가 아니라 글자로 읽기 때문입니다.

```mermaid
flowchart LR
  req(["GET /courses<br/>?q=검색어<br/>토큰 없음"])

  subgraph api["API"]
    g["인증·인가 Guard<br/>공개 경로의 요청을<br/>통과시킴"]
    s["강의 검색<br/>쿼리와 검색어를<br/>따로 보냄"]
  end

  subgraph db["PostgreSQL"]
    c[("courses<br/>제목")]
    u[("users<br/>비밀번호 해시")]
    e[("enrollments<br/>전화번호")]
  end

  req --> g --> s
  s -- "쿼리: … ILIKE $1<br/>값: 검색어" --> c
  s --> res(["200 · 제목에 검색어가<br/>포함된 강의만"])

  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef neutral fill:#f6f8fa,stroke:#57606a,color:#24292f
  class g,s,c safe
  class u,e neutral
  style api fill:none,stroke:#57606a
  style db fill:none,stroke:#57606a
  linkStyle 2 stroke:#0F6E56,stroke-width:2px
```

3절의 그림에 있던 빨간색 화살표 두 개(강의 검색에서 `users`와 `enrollments`로 가는 화살표)가 이 그림에는 없습니다. 검색어에 무엇이 들어 있든 DB가 실행하는 쿼리는 `courses` 테이블을 읽는 `SELECT` 하나입니다.

### 4.3 수정 뒤에 추가한 것

4.1절에서 확인한 동작 세 가지(와일드카드, 널 바이트, `q`를 두 번 보낸 요청)는 수정 태그(`v2-fix-6`)의 코드에도 남아 있습니다. 세 가지는 수정 태그 뒤의 커밋 두 개에서 고쳤습니다. [`52f406b`](https://github.com/loquemedalagana/secure-enroll-demo/commit/52f406b)는 검색어의 입력값 검증을 추가한 커밋이고, [`0ee3465`](https://github.com/loquemedalagana/secure-enroll-demo/commit/0ee3465)는 와일드카드 처리를 추가한 커밋입니다. 수정 태그가 가리키는 커밋은 결함 6을 고친 커밋([`085f3a4`](https://github.com/loquemedalagana/secure-enroll-demo/commit/085f3a4))입니다. `52f406b`와 `0ee3465`는 결함 6을 고치는 커밋이 아닙니다. 결함 6은 `085f3a4`가 `$queryRawUnsafe`를 `$queryRaw`로 바꿔 고쳤습니다(4.2절). `52f406b`와 `0ee3465`를 적용하지 않은 수정 태그의 코드에서도 재현 스크립트는 "차단"으로 판정합니다(5절). 두 커밋이 추가한 것과, 추가하기 전과 후의 응답은 아래 두 표에 적었습니다.

| 추가한 것 | 내용 | 코드 |
|---|---|---|
| 검색어의 입력값 검증 | `SearchCoursesDto`는 `q`가 문자열 하나이고(`@IsString()`), 100자 이하이고(`@MaxLength(100)`), 널 바이트가 없어야 한다고(`@Matches(/^[^\0]*$/)`) 선언합니다. 전역 `ValidationPipe`는 이 조건에 맞지 않는 요청과 DTO에 없는 필드가 포함된 요청에 400으로 응답합니다. 로그인의 request body도 같은 방법으로 검증합니다 | [`courses/search-courses.dto.ts` 8~12행](https://github.com/loquemedalagana/secure-enroll-demo/blob/52f406b/apps/api/src/courses/search-courses.dto.ts#L8-L12) |
| 와일드카드 처리 | `search()`는 `q.replace(/[\\%_]/g, '\\$&')`로 검색어의 역슬래시, `%`, `_` 앞에 역슬래시를 붙여 DB에 넘깁니다. 그래서 `LIKE`는 세 글자를 와일드카드가 아니라 글자 그대로 찾습니다 | [`courses/courses.service.ts` 21행](https://github.com/loquemedalagana/secure-enroll-demo/blob/0ee3465/apps/api/src/courses/courses.service.ts#L21) |

| 검색어 | 수정 태그 (`v2-fix-6`) | 추가한 뒤 |
|---|---|---|
| `q`를 두 번 (`?q=보안&q=실습`) | 200, 0건 (`보안,실습`으로 검색) | 400 |
| 널 바이트 (`%00`) | 500 | 400 |
| 101자 | DB로 그대로 감 | 400 |
| `%` | 200, 2건 | 200, 0건 |
| `_` | 200, 2건 | 200, 0건 |
| 정상 검색어 (`보안`) | 1건 | 1건 (바뀐 것 없음) |

와일드카드 처리의 이스케이프는 4.1절 방안 1의 이스케이프와 하는 일이 다릅니다. 방안 1의 이스케이프는 검색어를 SQL 문자열에 넣으려고 작은따옴표를 바꿉니다. 방안 1의 이스케이프를 한 곳이라도 적용하지 않으면 그 곳에서 SQL 인젝션이 성공합니다. 와일드카드 처리에서는 API가 검색어를 플레이스홀더의 값으로 보내고, 이스케이프는 `LIKE`가 값 안의 `%`와 `_`를 읽는 방식만 정합니다. 와일드카드 처리의 이스케이프를 적용하지 않으면 검색 결과만 달라집니다. 검색어 `%`를 보냈을 때 PostgreSQL 로그에 남은 줄은 다음과 같습니다.

```
execute <unnamed>: SELECT id, title FROM courses WHERE title ILIKE $1 ORDER BY id ASC
Parameters: $1 = '%\%%'
```

`apps/api/test/courses.test.mjs`에 테스트 5건을 추가했습니다. 5건은 입력값 검증 테스트 4건과 와일드카드 처리 테스트 1건입니다. 두 커밋을 적용한 뒤 API 테스트 104건이 모두 통과합니다. 재현 스크립트는 그대로 "차단"으로 판정합니다. `standard_conforming_strings=off`에서 4.1절의 검색어(`\' UNION SELECT … FROM users --`)를 다시 보냈을 때도 API는 0건으로 응답했습니다.

## 5. 조치 뒤 재확인

태그 `v2-fix-6`의 코드로 API를 로컬에서 띄우고, 2절과 같은 스크립트를 실행한 결과입니다.

```bash
node .github/scripts/defects/defect-6.mjs --expect blocked
```

```
결함 6: 강의 검색(GET /courses?q=)의 검색어 처리
대상: http://127.0.0.1:4000
- 검색어: 암호학 (토큰 없음, 0건이어야 함)
    → 상태 200 · 0건
- 검색어: 작은따옴표 하나 (')
    → 상태 200 · 0건
- 검색어: 암호학' OR '%'='
    → 상태 200 · 0건 · 강의 0건
- 검색어: 암호학' UNION SELECT … FROM users
    → 상태 200 · 0건 · 사용자 테이블에서 온 행 0건(계정 이름과 비밀번호 해시)
- 검색어: 암호학' UNION SELECT … FROM enrollments
    → 상태 200 · 0건 · 신청 테이블에서 온 행 0건(신청 id와 전화번호)
판정: 차단
```

| 확인 | 결함 상태 (`v2-defect-6`) | 조치 뒤 (`v2-fix-6`) |
|---|---|---|
| 작은따옴표 하나 | 500 | 200, 0건 |
| 조건을 항상 참으로 만드는 검색어 | 강의 2건 | 0건 |
| `UNION SELECT … FROM users` | 5건 (계정 이름과 비밀번호 해시) | 0건 |
| `UNION SELECT … FROM enrollments` | 3건 (신청 id와 전화번호) | 0건 |
| 정상 검색어 (`보안`) | 1건 | 1건 (바뀐 것 없음) |
| 검색어가 DB로 가는 방식 | SQL 문자열 안 | 플레이스홀더 `$1`의 값 |
| 수정 태그의 API 테스트 99건 | 5건 실패 | 모두 통과 |

표의 마지막 행은 결함 태그와 수정 태그의 코드를 각각 내려받아 `defects.yml`과 같은 순서로 로컬에서 실행한 결과입니다. 결함 태그의 코드에 수정 태그의 테스트를 실행하면 3.4절의 테스트 5건이 실패하고, 수정 태그의 코드에서는 99건이 모두 통과합니다.

### CI 실행 기록

이 결함을 다룬 PR에서 실행된 CI 기록입니다.

| 시점 | 커밋 | `api` 잡 | 실행 |
|---|---|---|---|
| 결함이 있는 코드를 푸시한 뒤 | `5997a97` | 통과 (94건. 결함을 잡는 테스트가 없었음) | [45934744786](https://github.com/loquemedalagana/secure-enroll-demo/actions/runs/45934744786) |
| 테스트를 추가한 뒤 | `abc8eb0` | 실패 (99건 중 5건) | [45940574333](https://github.com/loquemedalagana/secure-enroll-demo/actions/runs/45940574333) |
| 수정한 뒤 | `159648f` | 통과 (99건) | [45948629507](https://github.com/loquemedalagana/secure-enroll-demo/actions/runs/45948629507) |

표의 첫 줄은 결함 6이 있는 코드를 푸시한 뒤의 CI 기록입니다. 이 실행에서 API 테스트 94건이 모두 통과했고 `api` 잡도 통과했습니다. 94건 중 강의 검색 테스트는 2건이고, 이 2건은 검색어로 `보안`, `실습`, `없는 제목`, 빈 문자열만 보냅니다(3.3절). 네 검색어에는 작은따옴표가 없어서, 결함이 있는 코드도 결함을 고친 코드와 같은 강의 목록으로 응답합니다. 그래서 2건은 결함이 있는 코드에서도 통과했습니다. 결함 3이 있는 코드를 푸시했을 때는 `api` 잡이 실패했습니다. 인증 기능을 만들 때 추가한 테스트("서버 로그에 비밀번호와 토큰 값이 없음")가 결함 3이 있는 코드에서 실패했기 때문입니다.

표의 셋째 행은 수정 커밋([`085f3a4`](https://github.com/loquemedalagana/secure-enroll-demo/commit/085f3a4))과 그 뒤의 문서 커밋 2개를 함께 올린 뒤에 실행된 CI 기록입니다. 수정 커밋만 올려서 실행된 CI 기록은 없습니다.

실행 로그는 GitHub의 보존 기간(기본 90일)이 지나면 삭제됩니다. 그 뒤에도 `defects.yml`을 실행하면 위 표의 실패와 통과를 재현할 수 있습니다. 이 워크플로는 결함 태그의 코드에 수정 태그의 테스트를 실행해 같은 테스트가 실패하는지 확인하고, 수정 태그의 코드에서는 모두 통과하는지 확인합니다. 실패한 테스트의 이름은 Summary에 남깁니다.

## 6. Burp Suite 진단 기록

작성 전.
