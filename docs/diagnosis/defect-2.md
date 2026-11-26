# 결함 2 진단 보고서: 수강생 명단이 인증 없이 열림

| 항목 | 내용 |
|---|---|
| 대상 | 이 저장소의 태그 `v2-defect-2`를 로컬에서 띄운 API (`http://127.0.0.1:4000`) |
| 경로 | `GET /courses/:id/enrollments` |
| 분류 | OWASP Top 10 2025 A07 Authentication Failures / CWE-306 (중요 기능의 인증 누락) |
| 위험도 | 높음 |
| 해당 구성 요소 | PEP(정책 시행 지점). 시행 지점은 있지만 경로의 앞부분만 보고 통과시켜서, 판단(PE, `can()`)에 묻지 않습니다 |
| 상태 | 결함 확인. 조치 전 |

## 1. 요약

강의 목록(`GET /courses`)을 로그인 없이 보여 주려고 "경로가 `/courses`로 시작하면 공개"라는 조건을 넣었습니다. 같은 글자로 시작하는 수강생 명단(`GET /courses/:id/enrollments`)까지 토큰 없이 응답합니다. 응답에는 그 강의 수강생 전원의 사용자 id와 전화번호가 들어 있습니다. 학생 토큰이나 다른 강의의 강사 토큰으로 요청해도 같은 응답이 옵니다.

위험도를 높음으로 본 근거는 세 가지입니다. 인증이 필요 없고, 강의 id는 공개된 강의 목록에서 얻을 수 있으며, 요청 한 번에 그 강의 수강생 전원의 개인정보(전화번호)가 나옵니다.

## 2. 재현 절차

준비:

```bash
git checkout v2-defect-2
docker compose up -d --wait
cd apps/api
cp .env.example .env
npm ci --ignore-scripts
npm run db:generate && npm run build
npm run db:migrate && npm run db:seed
npm start
```

요청 1 (토큰 없음, 강의 id를 얻음):

```bash
curl -i http://127.0.0.1:4000/courses
```

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

[{"id":"c1","title":"웹 보안 입문"},{"id":"c2","title":"시큐어 코딩 실습"}]
```

이 응답은 의도한 동작입니다.

요청 2 (토큰 없음, 그 id로 명단을 요청):

```bash
curl -i http://127.0.0.1:4000/courses/c1/enrollments
```

응답 (전화번호는 이 문서에서 가렸습니다):

```
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: application/json; charset=utf-8

[{"id":"e1","userId":"u1","courseId":"c1","phone":"010-****-****"},
 {"id":"e2","userId":"u2","courseId":"c1","phone":"010-****-****"}]
```

재현 스크립트 (`main`의 스크립트를 결함 상태의 API에 실행):

```bash
node .github/scripts/defects/defect-2.mjs
```

```
결함 2: 수강생 명단(GET /courses/:id/enrollments)의 인증·인가
대상: http://127.0.0.1:4000
- GET /courses (토큰 없음, 공개가 맞음)
    → 상태 200 · 2건 · 필드: id, title
- GET /courses/c1/enrollments (토큰 없음)
    → 상태 200 · 2건 · 필드: courseId, id, phone, userId
- GET /courses/c1/enrollments (학생 토큰)
    → 상태 200 · 2건 · 필드: courseId, id, phone, userId
- GET /courses/c1/enrollments (다른 강의의 강사 토큰)
    → 상태 200 · 2건 · 필드: courseId, id, phone, userId
판정: 취약
```

기대한 동작은 토큰 없음 401, 학생 토큰 403, 다른 강의의 강사 토큰 403입니다.

## 3. 원인

Guard는 모든 요청에 돕니다(결함 1의 조치). 그런데 Guard가 맨 처음에 묻는 "이 요청은 공개인가"의 답이 경로의 앞부분으로 정해집니다.

```mermaid
flowchart LR
  req1(["GET /courses<br/>토큰 없음"])
  req2(["GET /courses/c1/enrollments<br/>토큰 없음"])
  req3(["GET /enrollments<br/>토큰 없음"])

  subgraph pep["전역 Guard · app.module.ts"]
    q{"isPublic()<br/>경로가 /courses로<br/>시작하는가"}
    g["토큰 검증<br/>can() 호출"]
    q -- "아니오" --> g
  end

  req1 --> q
  req2 --> q
  req3 --> q
  q -- "예" --> h1["강의 목록 핸들러"]
  q -- "예" --> h2["수강생 명단 핸들러<br/>@Authorize는 붙어 있지만<br/>읽히지 않음"]
  g -. "401" .-> out1(["거부"])
  h1 --> ok(["200 · 강의 2건<br/>의도한 공개"])
  h2 --> bad(["200 · 명단 2건<br/>전화번호 포함"])

  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  classDef check fill:#FAEEDA,stroke:#854F0B,color:#412402
  class g,out1,h1,ok safe
  class h2,bad danger
  class q check
  style pep fill:none,stroke:#0F6E56
  linkStyle 5,8 stroke:#A32D2D,stroke-width:2px
```

초록은 검사가 이루어지거나 의도대로 열린 곳, 빨강은 검사 없이 지나가는 곳, 노랑은 공개 여부를 판단하는 곳입니다.

### 3.1 원인 코드

- 공개 여부를 판단하는 함수가 경로의 앞부분을 비교합니다: [`auth/is-public.ts` 7행, 14~15행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/auth/is-public.ts#L7-L15).
- 인증 Guard와 인가 Guard가 둘 다 이 함수를 맨 먼저 부르고, 참이면 바로 통과시킵니다: [`auth/auth.guard.ts` 18행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/auth/auth.guard.ts#L18), [`authz/authz.guard.ts` 27행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/authz/authz.guard.ts#L27).
- 명단 핸들러에는 `@Authorize('roster:read', ...)`가 붙어 있고 정책 `can()`에도 규칙이 있습니다: [`courses/courses.controller.ts` 17~18행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/courses/courses.controller.ts#L17-L18). 인가 Guard가 27행에서 먼저 돌아가므로 이 표시는 읽히지 않습니다.

### 3.2 열려야 하는 경로와 실제로 열린 경로

등록된 경로는 9개입니다. "토큰 없이 요청하면" 칸은 이 태그의 코드가 실제로 하는 동작입니다.

| 경로 | 누가 볼 수 있어야 하나 | 토큰 없이 요청하면 | 근거 |
|---|---|---|---|
| `GET /health/live` | 누구나 | 열림 | [`health.controller.ts` 6행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/health/health.controller.ts#L6): `@Public()` |
| `GET /health/ready` | 누구나 | 열림 | 위와 같음 |
| `POST /auth/login` | 누구나 | 열림 | [`auth.controller.ts` 12행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/auth/auth.controller.ts#L12): 핸들러에 `@Public()` |
| `GET /courses` | 누구나 | 열림 | [`is-public.ts` 7행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/auth/is-public.ts#L7): 경로가 `/courses`로 시작함 |
| `GET /courses/:id/enrollments` | 담당 강사와 관리자만 | **열림** | 이 경로도 `/courses`로 시작함 (결함 2) |
| `GET /auth/me` | 로그인한 사용자 | 막힘 (401) | `@Public()`이 없고 `/courses`로 시작하지도 않음 |
| `GET /enrollments` | 로그인한 사용자 | 막힘 (401) | 위와 같음 |
| `GET /enrollments/:id` | 소유자, 담당 강사, 관리자 | 막힘 (401) | 위와 같음 |
| `GET /admin/enrollments` | 관리자만 | 막힘 (401) | 위와 같음 |

`/courses` 아래에 경로를 새로 만들면 그 경로도 토큰 없이 열립니다.

### 3.3 이 결함을 처음 잡은 것

결함 1에서 넣은 테스트(`apps/api/test/guard-coverage.test.mjs`의 "등록된 모든 경로: 공개 목록에 없는 경로는 토큰 없이 401")가 이 태그에서 실패합니다. API 테스트 71건 중 70건 통과, 1건 실패입니다.

```
✖ 등록된 모든 경로: 공개 목록에 없는 경로는 토큰 없이 401
  + [
  +   'GET /courses/:id/enrollments → 200'
  + ]
  - []
```

이 테스트는 공개 경로를 메서드와 경로로 하나씩 적은 목록과 비교합니다. 강의 목록을 공개하면서 그 목록에 `GET /courses`를 추가했고, 명단은 목록에 없어서 잡혔습니다. 코드는 경로의 앞부분만 보고, 테스트는 경로 전체를 적은 목록과 비교합니다. 같은 질문에 두 답이 달랐습니다.

같은 태그에서 새로 넣은 강의 테스트 3건(`apps/api/test/courses.test.mjs`)은 허용되는 경우만 확인하므로 통과합니다.

### 3.4 결함을 잡는 테스트

`apps/api/test/courses.test.mjs`에 테스트 5건을 더했습니다. 요청이 명단 핸들러에 닿기 전에 Guard가 묻는 것은 네 가지이고, 테스트는 각각 다른 자리를 지킵니다.

```mermaid
flowchart LR
  req(["GET /courses/c1/enrollments"])

  subgraph guard["전역 Guard가 차례로 묻는 것"]
    s1{{"1 공개 경로인가<br/>PEP"}}
    s2{{"2 토큰이 유효한가<br/>인증"}}
    s3{{"3 그 강의가 있는가<br/>객체 속성 (DB)"}}
    s4{{"4 can()이 허용하는가<br/>PE · RBAC, ABAC"}}
    s1 -- "아니오" --> s2 -- "예" --> s3 -- "예" --> s4
  end

  req --> s1
  s4 -- "예" --> h["명단 핸들러<br/>담당 강사, 관리자"]
  s2 -. "아니오" .-> r401(["401"])
  s3 -. "아니오" .-> r404(["404"])
  s4 -. "아니오" .-> r403(["403"])
  s1 == "예 (결함 2)" ==> h

  t5["테스트 5<br/>공개는 강의 목록 하나뿐"] -.- s1
  t1["테스트 1<br/>토큰 없이 401"] -.- r401
  t4["테스트 4<br/>없는 강의 id는 404"] -.- r404
  t2["테스트 2<br/>학생은 403"] -.- r403
  t3["테스트 3<br/>다른 강의의 강사는 403"] -.- r403

  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  classDef check fill:#FAEEDA,stroke:#854F0B,color:#412402
  classDef test fill:#E6F1FB,stroke:#185FA5,color:#0C2D50
  class s2,s3,s4,r401,r404,r403,h safe
  class s1 danger
  class t1,t2,t3,t4,t5 test
  style guard fill:none,stroke:#0F6E56
  linkStyle 8 stroke:#A32D2D,stroke-width:3px
```

빨강은 결함이 있는 단계와 그 단계에서 새는 길, 초록은 그 뒤의 검사와 결과, 파랑은 테스트입니다.

| 테스트 | 개발 관점: 무엇을 확인하나 | 보안 관점: 무엇을 지키나 |
|---|---|---|
| 1 토큰 없이 401 | 토큰 없는 요청에 401과 `{ "error": "unauthorized" }` | 인증 |
| 2 학생은 403 | 그 강의를 신청한 학생의 토큰에 403 | 인가, RBAC. 판단(PE, `can()`)이 역할만 보고 거부합니다 |
| 3 다른 강의의 강사는 403 | 역할은 강사이지만 그 강의의 담당이 아닌 토큰에 403 | 인가, ABAC. 판단(PE)이 주체의 id와 강의의 담당 강사를 비교합니다 |
| 4 없는 강의 id는 404 | 없는 id에 404와 `{ "error": "not_found" }` | 판단에 넣을 객체 속성을 DB에서 실제로 읽는가 |
| 5 공개는 강의 목록 하나뿐 | `GET /courses`는 200이고, `/courses` 아래의 다른 경로 4개는 토큰 없이 200이 아님 | 시행 지점(PEP)을 건너뛰는 길이 없는가 |

테스트 2와 3은 같은 403이지만 거부되는 이유가 다릅니다. 2는 역할 때문이고, 3은 역할은 맞는데 대상과의 관계가 맞지 않아서입니다.

이 커밋에서 API 테스트는 76건 중 70건 통과, 6건 실패입니다. 위 5건과 3.3절의 1건입니다.

```
✖ 수강생 명단 1: 토큰 없이 401            200 !== 401
✖ 수강생 명단 2: 학생은 ... 403           200 !== 403
✖ 수강생 명단 3: 다른 강의의 강사는 403    200 !== 403
✖ 수강생 명단 4: 없는 강의 id는 404        200 !== 404
✖ 수강생 명단 5: 공개는 강의 목록 하나뿐... 
✖ 등록된 모든 경로: ...                    'GET /courses/:id/enrollments → 200'
```

여섯 건이 서로 다른 자리를 지키는데 모두 실패합니다. 원인은 1단계 한 곳입니다. 1단계에서 "공개"로 답하면 2~4단계가 돌지 않습니다. 정책(`can()`)의 단위 테스트는 같은 커밋에서 모두 통과합니다.

### 3.5 보안 관점: 접근통제 구성 요소로 본 결함

접근통제는 "누가(주체) 무엇에(객체) 무엇을 하려는가(행위)"를 규칙에 따라 판단하고, 그 판단대로 막거나 통과시키는 일입니다. 이 경로를 그 요소에 맞춰 보면 다음과 같습니다.

| 구성 요소 | 이 경로에서 | 결함 상태(`v2-defect-2`) |
|---|---|---|
| 주체 | 요청을 보낸 사용자. 토큰에서 id를 읽고 DB에서 역할을 읽습니다 | 토큰을 읽지 않습니다 |
| 객체 | 강의 하나의 수강생 명단. 그 강의의 담당 강사가 누구인지가 판단에 쓰입니다 | 담당 강사를 읽지 않고 명단이 그대로 나갑니다 |
| 행위 | `roster:read`. 핸들러에 `@Authorize`로 적혀 있습니다 | 적혀 있지만 읽히지 않습니다 |
| 판단 (PE) | `can()`. 관리자, 또는 그 강의의 담당 강사만 허용합니다 | 불리지 않습니다. 규칙 자체는 맞습니다 |
| 시행 (PEP) | 전역 Guard. 모든 요청이 지나갑니다 | **지나가기는 하지만, 경로의 앞부분만 보고 통과시킵니다. 결함은 여기입니다** |
| 접근통제 모델 | RBAC(관리자인가)와 ABAC(이 강의의 담당 강사인가) | 둘 다 적용되지 않습니다 |

결함 1과 비교하면 이렇습니다.

| | 결함 1 | 결함 2 |
|---|---|---|
| 시행하는 자리 | 없었습니다 | 있습니다 |
| 무엇이 틀렸나 | 자리를 빠뜨렸습니다 | 자리는 있는데 "검사하지 않아도 되는 요청"을 고르는 기준이 틀렸습니다 |
| 판단(`can()`) | 맞습니다 | 맞습니다 |

두 결함 모두 규칙은 맞고, 그 규칙에 물어보지 않은 것이 문제입니다. 그래서 둘 다 분류가 인증 누락(CWE-306)입니다.

제로 트러스트의 원칙으로 보면 "모든 요청을 검사한다"에서 예외를 두는 방법이 틀린 경우입니다. 검사하지 않을 요청을 하나씩 정하지 않고, 주소가 `/courses`로 시작하면 모두 통과시켰습니다.

## 4. 조치

### 4.1 조치 방안 비교

작성 전. 수정에 들어가기 전에 적습니다.

### 4.2 적용한 조치

작성 전. 수정 커밋(`v2-fix-2`) 뒤에 적습니다.

## 5. 조치 뒤 재확인

작성 전. `v2-fix-2`에서 2절과 같은 요청을 다시 보낸 결과를 적습니다.

## 6. Burp Suite 진단 기록

작성 전.
