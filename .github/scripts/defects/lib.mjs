// 결함 재현 스크립트의 공통 도구.
// 실행 중인 API에 요청을 보내고, 그 상태가 "취약"인지 "차단"인지 판정해 출력한다.
// 출력에는 응답의 값(전화번호, 토큰, 비밀번호 해시)을 포함하지 않고 상태 코드, 건수, 필드 이름만 포함한다.
//
// 사용법: node .github/scripts/defects/defect-N.mjs [--expect vulnerable|blocked]
//   API_BASE 환경 변수로 대상 주소를 바꾼다(기본 http://127.0.0.1:4000).
//   --expect를 주면 판정이 기대와 다를 때 종료 코드 1로 끝난다.

export const BASE = process.env.API_BASE ?? 'http://127.0.0.1:4000';

// 더미 계정으로 로그인해 Authorization 헤더에 넣을 값(Bearer <토큰>)을 반환한다. 비밀번호는 시드의 규칙("<username>-pass")대로 만든다.
export async function bearerFor(username) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: `${username}-pass` }),
  });
  if (res.status !== 200) throw new Error(`로그인 실패: ${username} (${res.status})`);
  return `Bearer ${(await res.json()).token}`;
}

// 응답을 값 없이 요약한다. 배열이면 건수와 첫 항목의 필드 이름만 남긴다.
export async function summarize(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (Array.isArray(body)) {
    return { status: res.status, rows: body.length, fields: body.length > 0 ? Object.keys(body[0]).sort() : [] };
  }
  return { status: res.status, rows: null, fields: body && typeof body === 'object' ? Object.keys(body).sort() : [] };
}

export function describe({ status, rows, fields }) {
  const parts = [`상태 ${status}`];
  if (rows !== null) parts.push(`${rows}건`);
  if (fields.length > 0) parts.push(`필드: ${fields.join(', ')}`);
  return parts.join(' · ');
}

// steps: [{ request: '요청 설명', result: '응답 요약' }], vulnerable: 이 상태가 취약한가
export function finish(title, steps, vulnerable) {
  const verdict = vulnerable ? 'vulnerable' : 'blocked';
  console.log(title);
  console.log(`대상: ${BASE}`);
  for (const { request, result } of steps) console.log(`- ${request}\n    → ${result}`);
  console.log(`판정: ${vulnerable ? '취약' : '차단'}`);

  const at = process.argv.indexOf('--expect');
  const expected = at > 0 ? process.argv[at + 1] : undefined;
  if (expected !== undefined && expected !== verdict) {
    console.error(`기대(${expected})와 다릅니다.`);
    process.exit(1);
  }
}
