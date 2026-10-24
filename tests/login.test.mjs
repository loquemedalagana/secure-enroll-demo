// 로그인 요청 출처 제한 테스트 (HTTP 수준): 로그인 CSRF 회귀 방지
// 실행 전: npm ci && npm run build
// 인가 결함과 무관한 인증 기반이라 vulnerable·fixed 모두 통과해야 한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 3198;
const BASE = `http://127.0.0.1:${PORT}`;
const CREDENTIALS = JSON.stringify({ username: 'student1', password: 'student1-pass' });
let server;

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start (먼저 npm run build 를 실행했는지 확인)');
}

function login(headers) {
  return fetch(`${BASE}/api/login`, { method: 'POST', headers, body: CREDENTIALS });
}

before(async () => {
  server = spawn('node_modules/.bin/next', ['start', '-p', String(PORT)], {
    env: { ...process.env, SESSION_SECRET: 'dummy-test-secret' },
    stdio: 'ignore',
  });
  await waitReady();
});

after(() => server?.kill());

test('text/plain 본문 로그인 → 415, 세션 쿠키 없음', async () => {
  // 다른 사이트의 <form enctype="text/plain">이 만들 수 있는 요청
  const res = await login({ 'content-type': 'text/plain' });
  assert.equal(res.status, 415);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('다른 출처의 JSON 로그인 → 403, 세션 쿠키 없음', async () => {
  const res = await login({ 'content-type': 'application/json', origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('같은 출처의 JSON 로그인 → 200', async () => {
  const res = await login({ 'content-type': 'application/json', origin: BASE });
  assert.equal(res.status, 200);
});
