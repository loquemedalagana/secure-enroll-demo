// 토큰 발급·검증 단위 테스트. 빌드한 결과물(dist/auth/token.js)을 직접 불러온다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { TOKEN_TTL_SECONDS, issueToken, verifyToken } from '../dist/auth/token.js';

const SECRET = 'unit-test-only-secret-000000000000000';
const NOW = Date.UTC(2026, 10, 23, 0, 0, 0);
const NOW_SECONDS = NOW / 1000;

// 임의의 페이로드에 올바른 키로 서명한 토큰을 만든다(검증기가 서명 뒤에 페이로드 형식도 보는지 확인용).
function signed(payload) {
  const body = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

test('발급한 토큰은 검증을 통과하고 uid와 만료 시각(1시간 뒤)을 돌려줌', () => {
  const token = issueToken('u1', SECRET, NOW);
  assert.deepEqual(verifyToken(token, SECRET, NOW), { uid: 'u1', exp: NOW_SECONDS + TOKEN_TTL_SECONDS });
  assert.equal(TOKEN_TTL_SECONDS, 3600);
});

test('페이로드에는 uid와 exp만 있음(역할, 전화번호 없음)', () => {
  const [body] = issueToken('u1', SECRET, NOW).split('.');
  assert.deepEqual(Object.keys(JSON.parse(Buffer.from(body, 'base64url').toString())).sort(), ['exp', 'uid']);
});

test('만료 직전까지 통과하고, 만료 시각부터 거부됨', () => {
  const token = issueToken('u1', SECRET, NOW);
  assert.ok(verifyToken(token, SECRET, NOW + (TOKEN_TTL_SECONDS - 1) * 1000));
  assert.equal(verifyToken(token, SECRET, NOW + TOKEN_TTL_SECONDS * 1000), null);
});

test('다른 키로 서명한 토큰은 거부됨', () => {
  const token = issueToken('u1', 'another-secret-0000000000000000000000', NOW);
  assert.equal(verifyToken(token, SECRET, NOW), null);
});

test('페이로드를 바꾸면(uid를 a1로) 거부됨', () => {
  const [, signature] = issueToken('u1', SECRET, NOW).split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'a1', exp: NOW_SECONDS + TOKEN_TTL_SECONDS })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${signature}`, SECRET, NOW), null);
});

test('서명을 한 글자 바꾸거나 잘라내면 거부됨', () => {
  const [body, signature] = issueToken('u1', SECRET, NOW).split('.');
  const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  assert.equal(verifyToken(`${body}.${flipped}`, SECRET, NOW), null);
  assert.equal(verifyToken(`${body}.${signature.slice(0, -4)}`, SECRET, NOW), null);
  assert.equal(verifyToken(`${body}.`, SECRET, NOW), null);
});

test('형식이 깨진 토큰은 거부됨', () => {
  const token = issueToken('u1', SECRET, NOW);
  for (const bad of ['', '.', 'abc', token.split('.')[0], `${token}.extra`, `.${token.split('.')[1]}`]) {
    assert.equal(verifyToken(bad, SECRET, NOW), null, JSON.stringify(bad));
  }
});

test('서명이 맞아도 페이로드 형식이 틀리면 거부됨', () => {
  const exp = NOW_SECONDS + 60;
  const cases = ['not json', [], null, {}, { uid: 'u1' }, { exp }, { uid: '', exp }, { uid: 1, exp }, { uid: 'u1', exp: '9999999999' }, { uid: 'u1', exp: exp + 0.5 }];
  for (const payload of cases) {
    assert.equal(verifyToken(signed(payload), SECRET, NOW), null, JSON.stringify(payload));
  }
  // 같은 방식으로 만든 올바른 페이로드는 통과한다(위 거부가 서명 때문이 아님을 확인).
  assert.deepEqual(verifyToken(signed({ uid: 'u1', exp }), SECRET, NOW), { uid: 'u1', exp });
});
