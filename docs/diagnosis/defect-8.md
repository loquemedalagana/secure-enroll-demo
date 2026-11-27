# 결함 8 진단 보고서: 신청 생성이 본문의 사용자 id를 신뢰함

| 항목 | 내용 |
|---|---|
| 대상 | 이 저장소의 태그 `v2-defect-8`을 로컬에서 띄운 API (`http://127.0.0.1:4000`) |
| 경로 | `POST /enrollments` (학생의 토큰이 필요한 경로) |
| 분류 | OWASP Top 10 2025 A01 Broken Access Control / CWE-639 (사용자가 제어하는 키를 통한 인가 우회) |
| 위험도 | 높음 |
| 해당 구성 요소 | 객체의 속성(신청의 소유자). 시행 지점(PEP)과 판단(PE)은 정상으로 동작하고, 판단이 끝난 뒤에 쓰는 값을 검증되지 않은 본문에서 가져옵니다 |
| 상태 | 확인됨. 조치 전 |

## 1. 요약

신청 생성이 누구의 신청인지를 요청 본문의 `userId`에서 읽습니다. 로그인한 학생이 본문의 `userId`만 바꾸면 다른 사용자의 이름으로 신청이 만들어집니다. 인증과 인가는 모두 통과합니다. 토큰은 유효하고, 학생은 신청을 만들 수 있기 때문입니다.

위험도를 높음으로 본 근거입니다.

| | 근거 |
|---|---|
| 높이는 쪽 | 학생 계정 하나면 됩니다. 바꾸는 것은 본문의 값 하나입니다 |
| 높이는 쪽 | 대상에 제한이 없습니다. 다른 학생뿐 아니라 강사와 관리자의 id로도 신청이 만들어집니다 |
| 높이는 쪽 | 다른 사람의 이름으로 강의의 정원을 채울 수 있습니다. 정원이 찬 강의는 신청을 받지 않습니다 |
| 높이는 쪽 | 만들어진 신청은 요청한 사람이 지울 수 없습니다. 취소는 소유자와 관리자만 할 수 있어서, 이름이 쓰인 사람이나 관리자가 지워야 합니다 |
| 높이는 쪽 | 서버에는 누가 요청했는지(토큰의 사용자)와 신청의 소유자가 다르다는 기록이 남지 않습니다. 요청 로그의 `uid`는 요청한 사람이고, 신청에는 본문의 값만 남습니다 |
| 낮추는 쪽 | 로그인해야 합니다. 토큰 없이는 401입니다 |
| 낮추는 쪽 | 다른 사람의 정보를 읽게 되지는 않습니다. 응답에 나오는 것은 요청한 사람이 보낸 값입니다 |
| 낮추는 쪽 | 이름이 쓰인 사람은 자기 신청 목록에서 그 신청을 볼 수 있고 직접 취소할 수 있습니다 |

## 2. 재현 절차

준비:

```bash
git checkout v2-defect-8
docker compose up -d --wait
cd apps/api
cp .env.example .env
npm ci --ignore-scripts
npm run db:generate && npm run build
npm run db:migrate && npm run db:seed
npm start
```

요청 1 (`student1`로 로그인):

```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"username":"student1","password":"student1-pass"}' \
  http://127.0.0.1:4000/auth/login
```

요청 2 (`student1`의 토큰으로, 본문의 `userId`는 `student2`의 id인 `u2`):

```bash
curl -s -X POST -H 'authorization: Bearer <student1의 토큰>' -H 'content-type: application/json' \
  -d '{"userId":"u2","courseId":"c4","phone":"010-0000-0009"}' \
  http://127.0.0.1:4000/enrollments
```

201입니다. 응답의 `userId`가 `u2`입니다.

```json
{"id":"<새 id>","userId":"u2","courseId":"c4","phone":"010-0000-0009"}
```

`student2`로 로그인해 `GET /enrollments`를 보면 신청하지 않은 강의 `c4`가 목록에 있습니다. `student1`의 목록에는 없습니다.

재현 스크립트 (`main`의 스크립트를 결함 상태의 API에 실행):

```bash
node .github/scripts/defects/defect-8.mjs
```

```
결함 8: 신청 생성(POST /enrollments)의 신청자
대상: http://127.0.0.1:4000
- POST /enrollments (student1의 토큰, 본문 userId: u2)
    → 상태 201 · u2의 신청이 만들어짐
- POST /enrollments (student1의 토큰, 본문 userId: a1, 관리자의 id)
    → 상태 201 · a1의 신청이 만들어짐
- GET /enrollments (student2의 토큰) 요청 전과 후
    → 2건 → 3건
판정: 취약
```

스크립트는 만든 신청을 끝날 때 관리자 토큰으로 지웁니다. 기대한 동작은 두 요청 모두 신청이 만들어지지 않고, `student2`의 목록이 2건 그대로인 것입니다.

## 3. 원인

요청한 사람이 누구인지는 인증 Guard가 토큰으로 확인합니다. 신청의 소유자는 그 값이 아니라 본문에서 따로 읽습니다.

```mermaid
flowchart LR
  req(["POST /enrollments<br/>토큰: student1<br/>본문 userId: u2"])

  subgraph api["API"]
    a["인증 Guard<br/>토큰으로 u1 확인"]
    z["인가 Guard<br/>학생의 신청 생성<br/>허용"]
    h["신청 생성 핸들러<br/>본문의 userId로<br/>저장"]
  end

  db[("enrollments")]

  req --> a --> z --> h
  h == "userId: u2" ==> db
  h --> res(["201 · u2의 신청"])

  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  classDef neutral fill:#f6f8fa,stroke:#57606a,color:#24292f
  class a,z safe
  class h danger
  class db neutral
  style api fill:none,stroke:#57606a
  linkStyle 3 stroke:#A32D2D,stroke-width:3px
```

빨강은 검증되지 않은 값을 쓰는 곳과 그 값이 저장되는 경로, 초록은 정상으로 동작하는 곳입니다.

### 3.1 원인 코드

- 본문의 형식이 `userId`를 받습니다: [`enrollments/create-enrollment.dto.ts` 5~8행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-8/apps/api/src/enrollments/create-enrollment.dto.ts#L5-L8).
- 핸들러가 본문의 `userId`를 서비스에 넘깁니다: [`enrollments/enrollments.controller.ts` 23~25행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-8/apps/api/src/enrollments/enrollments.controller.ts#L23-L25). 토큰의 사용자(`@CurrentUser`)는 이 핸들러에서 쓰이지 않습니다.
- 서비스는 받은 값을 그대로 저장합니다: [`enrollments/enrollments.service.ts` 39행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-8/apps/api/src/enrollments/enrollments.service.ts#L39).

### 3.2 값이 어디에서 오는가

| 값 | 어디에서 오는가 | 누가 검증하는가 | 어디에 쓰이는가 |
|---|---|---|---|
| 요청한 사람 (`u1`) | 토큰 | 인증 Guard가 서명과 만료를 확인하고 DB에서 사용자를 읽음 | 인가 판단, 요청 로그의 `uid` |
| 신청의 소유자 (`u2`) | 본문의 `userId` | 형식(문자열, 길이)만 확인 | **저장되는 신청의 `userId`** |

두 값이 같아야 한다는 규칙이 코드 어디에도 없습니다. 조회와 취소에서는 소유자가 DB에 저장된 값이라 인가 Guard가 그것을 읽어 PE에 넘깁니다. 생성에서는 신청이 아직 없어서 넘길 객체가 없고, PE는 역할만 보고 허용합니다.

### 3.3 이 결함을 처음 잡은 테스트

없습니다. 이 태그에서 API 테스트 128건이 모두 통과합니다. 신청 생성 테스트는 모두 본문의 `userId`에 요청한 사람 자신의 id를 넣어 보냅니다.

### 3.4 결함을 잡는 테스트

작성 전.

### 3.5 보안 관점: 접근통제 구성 요소로 본 결함

| 구성 요소 | 이 결함에서 | 코드에서 확인하는 곳 |
|---|---|---|
| 주체 | 정상. 토큰으로 검증한 `student1` | `auth/auth.guard.ts` |
| 시행 (PEP) | 정상. 토큰이 없으면 401, 학생이 아니면 403입니다 | `auth/auth.guard.ts`, `authz/authz.guard.ts` |
| 판단 (PE) | 정상. `can(student1, 'enrollment:create')`는 참입니다. 누구의 신청인지는 판단의 입력에 없습니다 | `authz/policy.ts` |
| 객체의 속성 (소유자) | **검증되지 않은 본문에서 옵니다. 결함은 여기입니다** | [`enrollments/enrollments.controller.ts` 23~25행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-8/apps/api/src/enrollments/enrollments.controller.ts#L23-L25) |

결함 1과 2는 시행 지점이 요청을 막지 못한 경우였고, 결함 6은 시행 지점이 열어 준 범위 밖의 객체를 쿼리가 읽은 경우였습니다. 결함 8에서는 시행과 판단이 모두 맞게 끝납니다. 그 뒤에 만들어지는 객체의 소유자가 판단에 쓰인 주체와 다른 값으로 정해집니다.

제로 트러스트의 원칙으로 보면 주체는 요청마다 검증하고 있지만, 그 요청이 싣고 온 값은 검증 없이 믿은 경우입니다.

## 4. 조치

작성 전.

## 5. 조치 뒤 재확인

작성 전.

## 6. Burp Suite 진단 기록

작성 전.
