// Guard 적용 범위 테스트 (HTTP 수준, 실제 PostgreSQL)
// 결함 1(docs/v2-defects.md)을 잡는다: Guard가 붙지 않은 컨트롤러가 있으면 실패한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bearerFor, startServer } from './helpers.mjs';

// 토큰 없이 열어 두는 경로는 이 목록이 전부다. 공개 경로를 늘리려면 여기에 적어야 한다.
const PUBLIC_ROUTES = new Set(['GET /health/live', 'GET /health/ready', 'POST /auth/login']);

let server;
before(async () => {
  server = await startServer(4194);
});
after(async () => {
  await server?.stop();
});

const adminList = (authorization) =>
  fetch(`${server.base}/admin/enrollments`, { headers: authorization ? { authorization } : {} });

test('전체 신청 목록: 토큰 없이 401', async () => {
  const res = await adminList();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'unauthorized' });
});

test('전체 신청 목록: 학생과 강사는 403, 관리자는 200', async () => {
  for (const name of ['student1', 'instructor1']) {
    const res = await adminList(await bearerFor(server.base, name));
    assert.equal(res.status, 403, name);
    assert.deepEqual(await res.json(), { error: 'forbidden' }, name);
  }
  assert.equal((await adminList(await bearerFor(server.base, 'admin1'))).status, 200);
});

test('등록된 모든 경로: 공개 목록에 없는 경로는 토큰 없이 401', async () => {
  // 서버가 시작할 때 남기는 경로 등록 기록에서 실제로 등록된 경로를 모은다.
  const routes = [...server.output().matchAll(/Mapped \{(\S+), (\w+)\} route/g)].map(([, path, method]) => ({ method, path }));
  // 기록 형식이 바뀌어 경로를 하나도 못 읽으면, 통과가 아니라 실패여야 한다.
  assert.ok(routes.length >= 6, `경로를 ${routes.length}개만 읽었습니다`);
  for (const key of PUBLIC_ROUTES) {
    assert.ok(routes.some((r) => `${r.method} ${r.path}` === key), `공개 목록의 경로가 등록돼 있지 않습니다: ${key}`);
  }

  const open = [];
  for (const { method, path } of routes) {
    if (PUBLIC_ROUTES.has(`${method} ${path}`)) continue;
    const res = await fetch(`${server.base}${path.replace(/:\w+/g, 'x')}`, { method });
    if (res.status !== 401) open.push(`${method} ${path} → ${res.status}`);
  }
  assert.deepEqual(open, [], '토큰 없이 401이 아닌 경로가 있습니다');
});
