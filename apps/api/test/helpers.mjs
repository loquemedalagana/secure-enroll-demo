// 테스트 공통 도구. 빌드한 결과물(dist/main.js)을 별도 프로세스로 띄우고 HTTP로 요청한다.
// 실행 전: npm ci, npm run db:generate, npm run build, npm run db:migrate, npm run db:seed
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if ((!process.env.DATABASE_URL || !process.env.TOKEN_SECRET) && existsSync('.env')) process.loadEnvFile('.env');

export const DATABASE_URL = process.env.DATABASE_URL;
export const TOKEN_SECRET = process.env.TOKEN_SECRET;
if (!DATABASE_URL || !TOKEN_SECRET) throw new Error('DATABASE_URL과 TOKEN_SECRET이 필요합니다. .env.example을 참고하세요.');

export async function startServer(port, env = {}) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    env: { PATH: process.env.PATH, DATABASE_URL, TOKEN_SECRET, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`서버가 시작 중에 종료됐습니다(코드 ${child.exitCode}).\n${output}`);
    try {
      if ((await fetch(`${base}/health/live`)).ok) return { base, output: () => output, stop: () => stop(child) };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await stop(child);
  throw new Error(`서버가 시작되지 않았습니다(먼저 npm run build를 실행했는지 확인).\n${output}`);
}

function stop(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
  });
}

// 서버를 띄우되 스스로 끝날 때까지 기다린다(시작 거부 확인용).
export function runUntilExit(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['dist/main.js'], { env: { PATH: process.env.PATH, ...env }, stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

// 더미 계정으로 로그인해 Authorization 헤더 값을 돌려준다. 비밀번호는 시드 규칙("<username>-pass")이다.
export async function bearerFor(base, username) {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: `${username}-pass` }),
  });
  if (res.status !== 200) throw new Error(`로그인 실패: ${username} (${res.status})`);
  return `Bearer ${(await res.json()).token}`;
}
