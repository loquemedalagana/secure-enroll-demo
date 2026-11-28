// 결함 3 재현: API가 비밀번호와 토큰을 서버 로그에 기록하는지 확인한다.
// 보고서: docs/diagnosis/defect-3.md
//
// 사용법: node .github/scripts/defects/defect-3.mjs <서버 로그 파일> [--expect vulnerable|blocked]
//   API를 띄울 때 서버 로그를 파일에 저장하게 한 뒤 이 스크립트를 실행한다. 예: npm start > /tmp/api.log 2>&1 &
//   이 스크립트가 요청을 보내기 전에 서버 로그에 있던 줄은 확인하지 않는다. 찾은 값은 출력하지 않고, 값이 있는 줄의 수만 출력한다.
import { readFileSync, statSync } from 'node:fs';
import { BASE, finish } from './lib.mjs';

const logPath = process.argv[2];
if (!logPath || logPath.startsWith('--')) {
  console.error('사용법: node .github/scripts/defects/defect-3.mjs <서버 로그 파일> [--expect vulnerable|blocked]');
  process.exit(2);
}

const username = 'student1';
const password = `${username}-pass`;
const before = statSync(logPath).size;

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
if (login.status !== 200) throw new Error(`로그인 실패 (${login.status})`);
const { token } = await login.json();
const me = await fetch(`${BASE}/auth/me`, { headers: { authorization: `Bearer ${token}` } });

// 서버가 로그를 파일에 다 쓸 때까지 잠시 기다린다.
await new Promise((resolve) => setTimeout(resolve, 500));
const lines = readFileSync(logPath).subarray(before).toString('utf8').split('\n').filter((line) => line.length > 0);
const withPassword = lines.filter((line) => line.includes(password)).length;
const withToken = lines.filter((line) => line.includes(token)).length;
const found = (count) => (count > 0 ? `있음 (${count}줄)` : '없음');

finish(
  '결함 3: 서버 로그의 비밀번호와 토큰',
  [
    { request: 'POST /auth/login (student1)', result: `상태 ${login.status}` },
    { request: 'GET /auth/me (받은 토큰)', result: `상태 ${me.status}` },
    { request: `서버 로그에 추가된 줄: ${lines.length}줄`, result: `비밀번호 ${found(withPassword)} · 토큰 ${found(withToken)}` },
  ],
  // 요청 두 번으로 추가된 줄에 비밀번호나 토큰이 있으면 취약이다. 요청이 기록되지 않았으면 판정할 수 없다.
  withPassword > 0 || withToken > 0,
);
if (lines.length === 0) {
  console.error('로그에 추가된 줄이 없습니다. 로그 파일 경로가 맞는지 확인하세요.');
  process.exit(2);
}
