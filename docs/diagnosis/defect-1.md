# 결함 1 진단 보고서: 전체 신청 목록이 인증 없이 열림

| 항목 | 내용 |
|---|---|
| 대상 | 이 저장소의 태그 `v2-defect-1`을 로컬에서 띄운 API (`http://127.0.0.1:4000`) |
| 경로 | `GET /admin/enrollments` |
| 분류 | OWASP Top 10 2025 A07 Authentication Failures / CWE-306 (중요 기능의 인증 누락) |
| 위험도 | 높음 |
| 해당 구성 요소 | PEP(정책 시행 지점). 이 경로에는 시행 지점이 없습니다 |
| 상태 | 결함 확인. 조치 전 |

## 1. 요약

전체 신청 목록을 돌려주는 경로가 토큰 없이도 응답합니다. 응답에는 모든 신청의 사용자 id, 강의 id, 전화번호가 들어 있습니다. 학생 토큰으로 요청해도 같은 응답이 옵니다.

위험도를 높음으로 본 근거는 세 가지입니다. 인증이 필요 없고, 요청 한 번으로 끝나며, 전체 사용자의 개인정보(전화번호)가 나옵니다.

## 2. 재현 절차

준비:

```bash
git checkout v2-defect-1
docker compose up -d --wait
cd apps/api
cp .env.example .env
npm ci --ignore-scripts
npm run db:generate && npm run build
npm run db:migrate && npm run db:seed
npm start
```

요청 (토큰 없음):

```bash
curl -i http://127.0.0.1:4000/admin/enrollments
```

응답 (전화번호는 이 문서에서 가렸습니다):

```
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: application/json; charset=utf-8

[{"id":"e1","userId":"u1","courseId":"c1","phone":"010-****-****"},
 {"id":"e2","userId":"u2","courseId":"c1","phone":"010-****-****"},
 {"id":"e3","userId":"u2","courseId":"c2","phone":"010-****-****"}]
```

재현 스크립트 (`main`의 스크립트를 결함 상태의 API에 실행):

```bash
node .github/scripts/defects/defect-1.mjs
```

```
결함 1: 전체 신청 목록(GET /admin/enrollments)의 인증·인가
대상: http://127.0.0.1:4000
- GET /admin/enrollments (토큰 없음)
    → 상태 200 · 3건 · 필드: courseId, id, phone, userId
- GET /admin/enrollments (학생 토큰)
    → 상태 200 · 3건 · 필드: courseId, id, phone, userId
판정: 취약
```

기대한 동작은 토큰 없음 401, 학생 토큰 403입니다.

## 3. 원인

같은 "토큰 없는 요청"이 컨트롤러에 따라 다르게 처리됩니다.

```mermaid
flowchart LR
  req1(["GET /enrollments/e2<br/>토큰 없음"])
  req2(["GET /admin/enrollments<br/>토큰 없음"])

  subgraph c1["EnrollmentsController · @UseGuards 있음"]
    g1["인증 Guard"] --> g2["인가 Guard<br/>can() 호출"] --> h1["핸들러"]
  end
  subgraph c2["AdminController · @UseGuards 없음"]
    h2["핸들러<br/>@Authorize는 붙어 있지만<br/>읽는 Guard가 없음"]
  end

  req1 --> g1
  g1 -. "401" .-> out1(["거부"])
  req2 --> h2
  h2 --> out2(["200 · 전체 신청 3건"])

  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  class g1,g2,out1 safe
  class h2,out2 danger
  style c1 fill:none,stroke:#0F6E56
  style c2 fill:none,stroke:#A32D2D,stroke-dasharray:4 3
  linkStyle 4,5 stroke:#A32D2D,stroke-width:2px
```

초록은 검사가 이루어지는 곳, 빨강은 검사 없이 지나가는 곳입니다.

- Guard를 전역으로 등록하지 않고 컨트롤러마다 `@UseGuards(AuthGuard, AuthzGuard)`로 붙입니다(`apps/api/src/auth/auth.controller.ts`, `apps/api/src/enrollments/enrollments.controller.ts`).
- 관리자 컨트롤러(`apps/api/src/enrollments/admin.controller.ts`)에는 `@UseGuards`가 없습니다.
- 핸들러에는 `@Authorize('admin:read')`가 붙어 있지만, 이것은 인가 Guard가 읽는 표시일 뿐입니다. Guard가 돌지 않으면 아무도 읽지 않습니다.
- 관리자로 로그인해서 확인하면 목록이 정상으로 나옵니다. 정상 경로만 검사하는 기존 테스트 59건은 이 상태에서 모두 통과합니다.

## 4. 조치

작성 전. 수정 커밋(`v2-fix-1`) 뒤에 적습니다.

## 5. 조치 뒤 재확인

작성 전. `v2-fix-1`에서 2절과 같은 요청을 다시 보낸 결과를 적습니다.

## 6. Burp Suite 진단 기록

작성 전.
