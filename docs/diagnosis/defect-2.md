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

### 3.2 의도한 범위와 실제로 열린 범위

등록된 경로는 9개입니다. "공개 판단" 칸은 이 태그의 코드가 내는 답입니다.

| 경로 | 의도 | 공개 판단 | 근거 |
|---|---|---|---|
| `GET /health/live` | 공개 | 공개 | [`health.controller.ts` 6행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/health/health.controller.ts#L6): `@Public()` |
| `GET /health/ready` | 공개 | 공개 | 위와 같음 |
| `POST /auth/login` | 공개 | 공개 | [`auth.controller.ts` 12행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/auth/auth.controller.ts#L12): 핸들러에 `@Public()` |
| `GET /courses` | 공개 | 공개 | [`is-public.ts` 7행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-2/apps/api/src/auth/is-public.ts#L7): 접두사 `/courses` |
| `GET /courses/:id/enrollments` | 담당 강사와 관리자만 | **공개** | 같은 접두사에 맞음 (결함 2) |
| `GET /auth/me` | 로그인 필요 | 보호 | 표시도 접두사도 없음 |
| `GET /enrollments` | 로그인 필요 | 보호 | 위와 같음 |
| `GET /enrollments/:id` | 소유자, 담당 강사, 관리자 | 보호 | 위와 같음 |
| `GET /admin/enrollments` | 관리자만 | 보호 | 위와 같음 |

`/courses` 아래에 경로를 추가하면 그 경로도 같은 조건에 맞아 공개가 됩니다.

### 3.3 이 결함을 처음 잡은 것

결함 1에서 넣은 테스트(`apps/api/test/guard-coverage.test.mjs`의 "등록된 모든 경로: 공개 목록에 없는 경로는 토큰 없이 401")가 이 태그에서 실패합니다. API 테스트 71건 중 70건 통과, 1건 실패입니다.

```
✖ 등록된 모든 경로: 공개 목록에 없는 경로는 토큰 없이 401
  + [
  +   'GET /courses/:id/enrollments → 200'
  + ]
  - []
```

이 테스트는 공개 경로를 메서드와 경로로 하나씩 적은 목록과 비교합니다. 강의 목록을 공개하면서 그 목록에 `GET /courses`를 추가했고, 명단은 목록에 없어서 잡혔습니다. 코드는 접두사로, 테스트는 정확한 목록으로 같은 질문에 답했고 두 답이 달랐습니다.

같은 태그에서 새로 넣은 강의 테스트 3건(`apps/api/test/courses.test.mjs`)은 허용되는 경우만 확인하므로 통과합니다.

## 4. 조치

### 4.1 조치 방안 비교

작성 전. 수정에 들어가기 전에 적습니다.

### 4.2 적용한 조치

작성 전. 수정 커밋(`v2-fix-2`) 뒤에 적습니다.

## 5. 조치 뒤 재확인

작성 전. `v2-fix-2`에서 2절과 같은 요청을 다시 보낸 결과를 적습니다.

## 6. Burp Suite 진단 기록

작성 전.
