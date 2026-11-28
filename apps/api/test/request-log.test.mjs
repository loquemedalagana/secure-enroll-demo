// 요청 로그 테스트 (HTTP 수준, 실제 PostgreSQL)
// API가 서버 로그에 JSON 형식으로 기록한 줄을 읽어, 요청 하나에 한 줄이고 그 줄에 정해진 필드만 있는지 확인한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bearerFor, startServer } from './helpers.mjs';

// 로그 한 줄에 들어갈 수 있는 필드는 이 목록이 전부다(src/common/request-log.ts의 RequestLogLine).
const FIELDS = ['time', 'id', 'method', 'path', 'status', 'ms', 'uid', 'action', 'allowed'];

let server;
const auth = {};
before(async () => {
  server = await startServer(4191);
  for (const name of ['student1', 'admin1']) auth[name] = await bearerFor(server.base, name);
});
after(async () => {
  await server?.stop();
});

const lines = () =>
  server
    .output()
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));

// 요청을 보내고 그 요청의 로그 줄들을 돌려준다. 응답 헤더의 X-Request-Id로 자기 줄을 찾는다.
// 로그는 응답이 끝난 뒤에 쓰이므로 잠시 기다린다.
async function logOf(path, who) {
  const res = await fetch(`${server.base}${path}`, { headers: who ? { authorization: auth[who] } : {} });
  await res.arrayBuffer();
  const id = res.headers.get('x-request-id');
  assert.ok(id, '응답에 X-Request-Id가 없습니다');
  for (let i = 0; i < 100; i++) {
    const added = lines().filter((line) => line.id === id);
    if (added.length > 0) return { status: res.status, added };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return { status: res.status, added: [] };
}

test('요청 로그: 요청 하나에 한 줄, 정해진 필드만', async () => {
  const { status, added } = await logOf('/auth/me', 'student1');
  assert.equal(status, 200);
  assert.equal(added.length, 1);
  const [line] = added;
  for (const key of Object.keys(line)) assert.ok(FIELDS.includes(key), `목록에 없는 필드: ${key}`);
  assert.equal(line.method, 'GET');
  assert.equal(line.path, '/auth/me');
  assert.equal(line.status, 200);
  assert.equal(line.uid, 'u1');
  assert.equal(typeof line.ms, 'number');
  assert.match(line.id, /^[0-9a-f-]{36}$/);
  assert.ok(!Number.isNaN(Date.parse(line.time)));
});

test('요청 로그: 쿼리 문자열은 남기지 않음', async () => {
  const { added } = await logOf('/courses?q=value-for-log-check');
  assert.equal(added.length, 1);
  assert.equal(added[0].path, '/courses');
  assert.ok(!server.output().includes('value-for-log-check'));
});

test('요청 로그: 거부한 인가 판단은 행위와 함께 남음 (학생 → 수강생 명단, 403)', async () => {
  const { status, added } = await logOf('/courses/c1/enrollments', 'student1');
  assert.equal(status, 403);
  assert.deepEqual(
    { status: added[0].status, uid: added[0].uid, action: added[0].action, allowed: added[0].allowed },
    { status: 403, uid: 'u1', action: 'roster:read', allowed: false },
  );
});

test('요청 로그: 허용한 인가 판단도 남음 (관리자 → 전체 신청 목록, 200)', async () => {
  const { status, added } = await logOf('/admin/enrollments', 'admin1');
  assert.equal(status, 200);
  assert.deepEqual(
    { status: added[0].status, uid: added[0].uid, action: added[0].action, allowed: added[0].allowed },
    { status: 200, uid: 'a1', action: 'admin:read', allowed: true },
  );
});

test('요청 로그: 인가 Guard가 can()을 호출하지 않은 요청에는 uid, action, allowed가 없음 (공개 경로, 401)', async () => {
  for (const [path, expected] of [['/courses', 200], ['/auth/me', 401]]) {
    const { status, added } = await logOf(path);
    assert.equal(status, expected, path);
    assert.equal(added[0].status, expected, path);
    for (const key of ['uid', 'action', 'allowed']) assert.ok(!(key in added[0]), `${path}: ${key}`);
  }
});
