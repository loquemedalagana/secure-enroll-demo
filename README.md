# secure-enroll-demo

> ⚠️ **교육용 데모입니다. 의도적으로 인가 결함이 들어 있는 브랜치(`vulnerable`)가 있으며, 운영 환경 사용·배포 금지입니다. 로컬에서만 실행하세요.**
> 모든 사용자·데이터·시크릿은 더미이며, 특정 회사나 서비스의 코드와 무관합니다.

세미나 신청 서비스를 단순화한 Next.js 앱으로, **접근통제(RBAC/ABAC) 결함을 찾고 고치는 과정**을 코드와 테스트로 보여주는 보안 포트폴리오입니다.

## 브랜치
| 브랜치 | 내용 |
|---|---|
| `vulnerable` | 인증은 미들웨어에만 의존, 역할(RBAC)·소유자(ABAC) 검증 누락 |
| `fixed` (예정) | 서버 재검증, 정책 함수, 권한 매트릭스 테스트 통과 |

## 의도된 결함 (vulnerable)
1. **역할 확인 누락 (OWASP A01 Broken Access Control)** — `/api/admin/enrollments`가 로그인 여부만 보고 역할은 보지 않음
2. **소유자 확인 누락 (BOLA/IDOR)** — `/api/enrollments/[id]`가 요청자와 신청 소유자를 비교하지 않음
3. **인증을 미들웨어에만 의존** — 핸들러 안에서 세션을 다시 검증하지 않음

## 실행
```bash
cp .env.example .env.local
npm ci
npm run build
npm test        # 권한 매트릭스 테스트 (vulnerable에서는 일부 실패가 정상)
npm run dev     # 수동 확인
```

데모 계정 (더미): `student1`/`student1-pass`, `student2`/`student2-pass`, `instructor1`/`instructor1-pass`, `instructor2`/`instructor2-pass`, `admin1`/`admin1-pass`

## 공급망 메모
- 처음 기준선은 `next@14.2.24`였습니다. 이 버전에는 공개된 미들웨어 우회 보안 권고(CVE-2025-29927)가 있어, 수정 버전인 `14.2.25`로 정확히 고정해 올렸습니다. 이 브랜치도 `14.2.25`를 쓰며, 의도된 결함은 위의 인가 결함 3개뿐입니다. 최종본 설명은 `main` 브랜치의 README를 보세요.
- 이 저장소는 해당 취약점을 재현하지 않습니다. 의존성 감사(`npm audit`, OSV-Scanner)가 이를 어떻게 탐지하는지, 그리고 업그레이드·서버 재검증으로 어떻게 대응하는지를 다룹니다.

## 한계
- 인메모리 데이터, 단순 쿠키 세션 — 실제 서비스 수준의 인증·감사 로그·암호화는 범위 밖입니다.
