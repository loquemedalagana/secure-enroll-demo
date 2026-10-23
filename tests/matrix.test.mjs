// 권한 매트릭스 테스트 (HTTP 수준)
// 실행 전: npm ci && npm run build
// 기대 결과: vulnerable 브랜치에서는 일부 실패(= 인가 결함의 증거), fixed 브랜치에서는 전부 통과.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

const PASSWORDS = {
  student1: 'student1-pass',
  student2: 'student2-pass',
  instructor1: 'instructor1-pass',
  instructor2: 'instructor2-pass',
  admin1: 'admin1-pass',
};

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

async function login(username) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORDS[username] }),
  });
  assert.equal(res.status, 200, `login ${username}`);
  return res.headers.get('set-cookie').split(';')[0];
}

async function get(path, cookie) {
  return fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
}

before(async () => {
  server = spawn('node_modules/.bin/next', ['start', '-p', String(PORT)], {
    env: { ...process.env, SESSION_SECRET: 'dummy-test-secret' },
    stdio: 'ignore',
  });
  await waitReady();
});

after(() => server?.kill());

// 인증
test('비로그인 → 관리자 API 401', async () => {
  assert.equal((await get('/api/admin/enrollments')).status, 401);
});
test('비로그인 → 신청 상세 401', async () => {
  assert.equal((await get('/api/enrollments/e1')).status, 401);
});

// RBAC (역할)
test('student → 관리자 API 403', async () => {
  assert.equal((await get('/api/admin/enrollments', await login('student1'))).status, 403);
});
test('instructor → 관리자 API 403', async () => {
  assert.equal((await get('/api/admin/enrollments', await login('instructor1'))).status, 403);
});
test('admin → 관리자 API 200', async () => {
  assert.equal((await get('/api/admin/enrollments', await login('admin1'))).status, 200);
});

// ABAC (소유자·소속)
test('student → 본인 신청 200', async () => {
  assert.equal((await get('/api/enrollments/e1', await login('student1'))).status, 200);
});
test('student → 타인 신청 403', async () => {
  assert.equal((await get('/api/enrollments/e2', await login('student1'))).status, 403);
});
test('instructor → 자기 강의 수강 신청 200', async () => {
  assert.equal((await get('/api/enrollments/e1', await login('instructor1'))).status, 200);
});
test('instructor → 다른 강사 강의 수강 신청 403', async () => {
  // e3 = 강의 c2(instructor2 소속). instructor1은 접근 불가여야 함
  assert.equal((await get('/api/enrollments/e3', await login('instructor1'))).status, 403);
});
test('admin → 타인 신청 200', async () => {
  assert.equal((await get('/api/enrollments/e2', await login('admin1'))).status, 200);
});
