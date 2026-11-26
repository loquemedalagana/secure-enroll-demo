# 결함 3 진단 보고서: 서버 로그에 비밀번호와 토큰이 남음

| 항목 | 내용 |
|---|---|
| 대상 | 이 저장소의 태그 `v2-defect-3`을 로컬에서 띄운 API (`http://127.0.0.1:4000`)와 그 프로세스의 출력 |
| 경로 | `POST /auth/login`, 그리고 토큰을 붙여 보내는 모든 경로 |
| 분류 | OWASP Top 10 2025 A09 Security Logging and Alerting Failures / CWE-532 (로그 파일에 민감 정보 기록) |
| 위험도 | 중간 |
| 해당 구성 요소 | 주체의 자격 증명(비밀번호, 토큰). 시행 지점(PEP)과 판단(PE)은 정상으로 동작하고, 인증에 쓰인 값이 로그로 나갑니다 |
| 상태 | 결함 확인. 조치 전 |

## 1. 요약

요청 로그를 넣으면서 인증이 제대로 되는지 보려고 넣은 출력 두 줄이 남아 있습니다. 로그인하면 본문의 비밀번호가, 토큰을 붙여 요청하면 `Authorization` 헤더의 토큰이 서버 로그에 그대로 찍힙니다. 요청을 보낸 사람이 받는 응답은 정상이고, 응답만 봐서는 알 수 없습니다.

위험도를 중간으로 본 근거입니다.

- 낮추는 쪽: 요청만으로는 얻을 것이 없습니다. 서버 로그를 읽을 수 있어야 합니다.
- 높이는 쪽: 남는 값이 비밀번호 원문과 만료 전의 토큰입니다. 로그를 읽은 사람은 인증을 거치지 않고 그 사용자의 요청을 보낼 수 있고, 관리자가 로그인했다면 관리자의 것이 남습니다. 로그는 보통 앱보다 넓은 범위에서 읽히고 오래 보관됩니다.

## 2. 재현 절차

준비 (서버의 출력을 파일로 받습니다):

```bash
git checkout v2-defect-3
docker compose up -d --wait
cd apps/api
cp .env.example .env
npm ci --ignore-scripts
npm run db:generate && npm run build
npm run db:migrate && npm run db:seed
npm start > /tmp/api.log 2>&1 &
```

요청 1 (로그인):

```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"username":"student1","password":"student1-pass"}' \
  http://127.0.0.1:4000/auth/login
```

요청 2 (받은 토큰으로 자기 정보 조회):

```bash
curl -s -H 'authorization: Bearer <받은 토큰>' http://127.0.0.1:4000/auth/me
```

두 요청 모두 200으로 정상 응답합니다. 그 뒤의 서버 로그입니다(비밀번호와 토큰은 이 문서에서 가렸습니다).

```
login LoginDto { username: 'student1', password: '<비밀번호>' }
POST /auth/login 200 89ms
auth header Bearer <토큰>
GET /auth/me 200 2ms
```

1행과 3행이 문제입니다. 2행과 4행은 요청 로그가 원래 남기려던 줄입니다.

재현 스크립트 (`main`의 스크립트를 결함 상태의 API에 실행):

```bash
node .github/scripts/defects/defect-3.mjs /tmp/api.log
```

```
결함 3: 서버 로그의 비밀번호와 토큰
대상: http://127.0.0.1:4000
- POST /auth/login (student1)
    → 상태 200
- GET /auth/me (받은 토큰)
    → 상태 200
- 서버 로그에 새로 쓰인 줄: 4줄
    → 비밀번호 있음 (1줄) · 토큰 있음 (1줄)
판정: 취약
```

스크립트는 자기가 요청을 보낸 뒤에 새로 쓰인 줄만 보고, 찾은 값은 출력하지 않습니다. 기대한 동작은 비밀번호 없음, 토큰 없음입니다.

## 3. 원인

요청 하나가 처리되는 동안 로그에 값을 쓰는 곳이 세 군데이고, 그중 두 군데가 받은 값을 그대로 씁니다.

```mermaid
flowchart LR
  req1(["POST /auth/login<br/>본문에 비밀번호"])
  req2(["GET /auth/me<br/>헤더에 토큰"])

  subgraph api["API"]
    g["인증 Guard<br/>헤더를 출력"]
    h1["로그인 핸들러<br/>본문을 출력"]
    h2["자기 정보 핸들러"]
    m["요청 로그<br/>메서드, 주소, 상태, 시간"]
  end

  log[("서버 로그")]

  req1 --> h1
  req2 --> g --> h2
  h1 -- "비밀번호" --> log
  g -- "토큰" --> log
  m -- "POST /auth/login 200 89ms" --> log
  h1 --> ok1(["200 · 토큰 발급"])
  h2 --> ok2(["200 · id와 역할"])

  classDef safe fill:#E1F5EE,stroke:#0F6E56,color:#04342C
  classDef danger fill:#FCEBEB,stroke:#A32D2D,color:#501313
  class h2,m,ok1,ok2 safe
  class g,h1 danger
  style api fill:none,stroke:#57606a
  linkStyle 3,4 stroke:#A32D2D,stroke-width:2px
```

빨강은 받은 값을 그대로 로그에 쓰는 곳과 그 값이 나가는 길, 초록은 정상으로 동작하는 곳입니다. 응답은 두 요청 모두 정상입니다.

### 3.1 원인 코드

- 인증 Guard가 받은 `Authorization` 헤더를 출력합니다: [`auth/auth.guard.ts` 22행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/auth/auth.guard.ts#L22). 토큰을 검증하기 전의 줄이라, 틀린 토큰이나 만료된 토큰도 찍힙니다.
- 로그인 핸들러가 받은 본문을 출력합니다: [`auth/auth.controller.ts` 18행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/auth/auth.controller.ts#L18). 비밀번호를 확인하기 전의 줄이라, 틀린 비밀번호도 찍힙니다.
- 요청 로그 자체는 메서드, 주소, 상태 코드, 걸린 시간만 남깁니다: [`common/request-log.ts` 6~8행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/common/request-log.ts#L6-L8).

### 3.2 로그에 값을 쓰는 곳

| 쓰는 곳 | 언제 | 쓰는 값 | 민감한 값 |
|---|---|---|---|
| [`common/request-log.ts` 7행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/common/request-log.ts#L7) | 모든 요청이 끝날 때 | 메서드, 주소, 상태 코드, 걸린 시간 | 없음 |
| [`auth/auth.guard.ts` 22행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/auth/auth.guard.ts#L22) | `@Public`이 아닌 모든 요청 | `Authorization` 헤더 전체 | **토큰** |
| [`auth/auth.controller.ts` 18행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/auth/auth.controller.ts#L18) | `POST /auth/login` | 요청 본문 전체 | **비밀번호** |

`GET /courses`처럼 `@Public`이 붙은 경로는 인증 Guard가 헤더를 읽기 전에 통과시키므로 헤더가 찍히지 않습니다. 토큰이 찍히는 것은 로그인이 필요한 경로 5개 전부입니다.

### 3.3 이 결함을 처음 잡은 테스트

인증을 만들 때 넣어 둔 테스트(`apps/api/test/auth.test.mjs`의 "서버 출력에 비밀번호와 토큰 값이 없음")가 이 태그에서 실패합니다. API 테스트 86건 중 85건 통과, 1건 실패입니다.

이 테스트는 로그인한 뒤 서버 출력에 비밀번호와 발급된 토큰이 있는지 봅니다. 비밀번호가 찍혀서 실패했습니다. 토큰 쪽은 이 테스트로 확인되지 않습니다. 테스트가 받은 토큰을 다시 보내지 않아서, 헤더가 로그에 찍힐 일이 테스트 안에서 생기지 않습니다.

### 3.4 보안 관점: 접근통제 구성 요소로 본 결함

결함 1과 2는 요청을 막아야 할 곳에서 막지 못한 경우였습니다. 결함 3에서는 막는 일이 모두 정상으로 이루어집니다. 그 과정에서 쓰인 값이 다른 길로 나갑니다.

| 구성 요소 | 이 결함에서 | 코드에서 확인하는 곳 |
|---|---|---|
| 주체의 자격 증명 | 비밀번호와 토큰. **인증에 쓰인 뒤 로그에 그대로 남습니다. 결함은 여기입니다** | [`auth/auth.guard.ts` 22행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/auth/auth.guard.ts#L22), [`auth/auth.controller.ts` 18행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/auth/auth.controller.ts#L18) |
| 시행 (PEP) | 정상. 토큰이 없거나 틀리면 401입니다 | [`auth/auth.guard.ts` 24~26행](https://github.com/loquemedalagana/secure-enroll-demo/blob/v2-defect-3/apps/api/src/auth/auth.guard.ts#L24-L26) |
| 판단 (PE) | 정상. `can()`이 규칙대로 허용하고 거부합니다 | `authz/policy.ts` |
| 로그 | 앱 바깥에서 읽히는 출력. 읽을 수 있는 사람의 범위가 앱의 접근통제와 따로 정해집니다 | 프로세스의 표준 출력 |

토큰은 만료(1시간) 전까지 그 사용자를 대신합니다. 로그를 읽을 수 있는 사람은 로그인하지 않고도 그 자격을 얻습니다. 앱의 접근통제가 아무리 맞아도, 자격 증명이 접근통제 밖으로 나가면 소용이 없습니다.

제로 트러스트의 원칙으로 보면 "요청마다 인증한다"는 지켜지고 있지만, 그 인증에 쓰는 값을 지키지 못한 경우입니다.

## 4. 조치

### 4.1 조치 방안 비교

작성 전. 수정에 들어가기 전에 적습니다.

### 4.2 적용한 조치

작성 전. 수정 커밋(`v2-fix-3`) 뒤에 적습니다.

## 5. 조치 뒤 재확인

작성 전. `v2-fix-3`에서 2절과 같은 요청을 다시 보낸 결과를 적습니다.

## 6. Burp Suite 진단 기록

작성 전.
