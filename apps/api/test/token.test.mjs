// 토큰 발급·검증 단위 테스트. 빌드한 결과물(dist/auth/token.js)을 직접 불러온다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { TOKEN_TTL_SECONDS, issueToken, verifyToken } from '../dist/auth/token.js';

const SECRET = 'unit-test-only-secret-000000000000000';
const NOW = Date.UTC(2026, 10, 23, 0, 0, 0);
const NOW_SECONDS = NOW / 1000;

// 임의의 페이로드에 올바른 키로 서명한 토큰을 만든다. verifyToken이 서명을 확인한 뒤에 페이로드의 형식도 확인하는지 테스트하는 데 쓴다.
function signed(payload) {
  const body = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

test('발급한 토큰은 검증을 통과하고, verifyToken은 uid와 만료 시각(1시간 뒤)을 반환함', () => {
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

test('verifyToken은 다른 키로 서명한 토큰을 거부함', () => {
  const token = issueToken('u1', 'another-secret-0000000000000000000000', NOW);
  assert.equal(verifyToken(token, SECRET, NOW), null);
});

test('verifyToken은 페이로드를 바꾼(uid를 a1로) 토큰을 거부함', () => {
  const [, signature] = issueToken('u1', SECRET, NOW).split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'a1', exp: NOW_SECONDS + TOKEN_TTL_SECONDS })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${signature}`, SECRET, NOW), null);
});

test('verifyToken은 서명을 한 글자 바꾸거나 잘라 낸 토큰을 거부함', () => {
  const [body, signature] = issueToken('u1', SECRET, NOW).split('.');
  const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  assert.equal(verifyToken(`${body}.${flipped}`, SECRET, NOW), null);
  assert.equal(verifyToken(`${body}.${signature.slice(0, -4)}`, SECRET, NOW), null);
  assert.equal(verifyToken(`${body}.`, SECRET, NOW), null);
});

test('verifyToken은 형식이 잘못된 토큰을 거부함', () => {
  const token = issueToken('u1', SECRET, NOW);
  for (const bad of ['', '.', 'abc', token.split('.')[0], `${token}.extra`, `.${token.split('.')[1]}`]) {
    assert.equal(verifyToken(bad, SECRET, NOW), null, JSON.stringify(bad));
  }
});

test('verifyToken은 서명이 유효해도 페이로드의 형식이 잘못된 토큰을 거부함', () => {
  const exp = NOW_SECONDS + 60;
  const cases = ['not json', [], null, {}, { uid: 'u1' }, { exp }, { uid: '', exp }, { uid: 1, exp }, { uid: 'u1', exp: '9999999999' }, { uid: 'u1', exp: exp + 0.5 }];
  for (const payload of cases) {
    assert.equal(verifyToken(signed(payload), SECRET, NOW), null, JSON.stringify(payload));
  }
  // 같은 방법으로 만든, 형식이 올바른 페이로드의 토큰은 verifyToken이 통과시킨다. 앞의 거부가 서명 때문이 아니라는 것을 확인한다.
  assert.deepEqual(verifyToken(signed({ uid: 'u1', exp }), SECRET, NOW), { uid: 'u1', exp });
});
