// 내려받은 태그의 API를 띄우고, 이 저장소(현재 커밋)의 재현 스크립트를 그 API에 실행한다.
// 재현 스크립트는 태그가 만들어진 뒤에 추가되므로 태그 안에는 없다. 그래서 앱만 태그의 것을 쓴다.
//
// 사용법: node .github/scripts/defects/reproduce.mjs <결함 번호> <태그를 내려받은 폴더> <vulnerable|blocked>
//   먼저 <폴더>/apps/api에서 설치, 빌드, 마이그레이션, 시드를 끝내야 한다.
//   DATABASE_URL과 TOKEN_SECRET은 환경 변수로 받는다. 포트는 REPRODUCE_PORT(기본 4000)다.
//   판정이 기대와 다르면 종료 코드 1, 서버를 띄우지 못하면 2로 끝난다.
// 스크립트는 서버 로그를 임시 파일에만 저장하고 화면에 출력하지 않는다. 결함 3이 있는 코드에서는 API가 토큰과 비밀번호를 서버 로그에 기록하기 때문이다.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [number, dir, expect] = process.argv.slice(2);
const LABEL = { vulnerable: '취약', blocked: '차단' };
if (!/^\d+$/.test(number ?? '') || !dir || !(expect in LABEL)) {
  console.error('사용법: node .github/scripts/defects/reproduce.mjs <결함 번호> <태그를 내려받은 폴더> <vulnerable|blocked>');
  process.exit(2);
}
const { DATABASE_URL, TOKEN_SECRET } = process.env;
if (!DATABASE_URL || !TOKEN_SECRET) {
  console.error('DATABASE_URL과 TOKEN_SECRET이 필요합니다.');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, `defect-${number}.mjs`);
const apiDir = resolve(dir, 'apps/api');
if (!existsSync(script)) fail(`재현 스크립트가 없습니다: defect-${number}.mjs`);
if (!existsSync(join(apiDir, 'dist/main.js'))) fail(`${apiDir}에 빌드한 결과물이 없습니다. 먼저 빌드하세요.`);

const tag = `v2-${expect === 'vulnerable' ? 'defect' : 'fix'}-${number}`;
const port = process.env.REPRODUCE_PORT ?? '4000';
const base = `http://127.0.0.1:${port}`;
const logPath = join(mkdtempSync(join(tmpdir(), 'defect-')), 'server.log');
const logFd = openSync(logPath, 'a');

const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: apiDir,
  env: { PATH: process.env.PATH, DATABASE_URL, TOKEN_SECRET, PORT: port },
  stdio: ['ignore', logFd, logFd],
});

function fail(message) {
  console.error(message);
  summarize([`**실행하지 못했습니다**: ${message}`]);
  process.exit(2);
}

function summarize(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [...lines, ''].join('\n'));
}

async function waitUntilUp() {
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) return false;
    try {
      if ((await fetch(`${base}/health/live`)).ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function stop() {
  if (server.exitCode !== null) return Promise.resolve();
  return new Promise((done) => {
    server.once('exit', done);
    server.kill('SIGTERM');
  });
}

if (!(await waitUntilUp())) {
  await stop();
  // 스크립트는 API가 시작되지 않았을 때 서버 로그의 마지막 20줄을 화면에 출력한다. API가 시작되지 않은 이유를 확인하는 데 필요하기 때문이다.
  // 스크립트가 그때까지 API에 보낸 요청은 GET /health/live뿐이어서, 이 20줄에는 토큰과 비밀번호가 없다.
  console.error(readFileSync(logPath, 'utf8').split('\n').slice(-20).join('\n'));
  fail(`${tag}의 서버가 시작되지 않았습니다.`);
}

// 재현 스크립트는 값을 출력하지 않는다(상태 코드, 건수, 필드 이름, 줄 수만). 그 출력을 그대로 옮긴다.
const run = spawnSync(process.execPath, [script, logPath, '--expect', expect], {
  env: { PATH: process.env.PATH, API_BASE: base },
  encoding: 'utf8',
});
await stop();

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();
console.log(output);

const lines = (run.stdout ?? '').split('\n');
const title = lines[0] ?? `결함 ${number}`;
const verdict = lines.find((line) => line.startsWith('판정: '))?.slice('판정: '.length) ?? '판정 없음';
const ok = run.status === 0;
const detail = lines.filter((line) => line.startsWith('- ') || line.startsWith('    → '));

summarize([
  // 결함마다 결함 태그를 먼저 실행한다. 그때 제목을 한 번 쓴다.
  ...(expect === 'vulnerable' ? [`### ${title}`, ''] : []),
  `**${expect === 'vulnerable' ? '결함 태그' : '수정 태그'} \`${tag}\`에서 재현**`,
  '',
  // 표시는 판정을 그대로 따른다(취약은 ❌, 차단은 ✅). 기대와 같은지는 글로 적는다.
  `${verdict === '차단' ? '✅' : '❌'} 판정: ${verdict}. ${ok ? '기대한 결과입니다.' : `⚠️ **기대(${LABEL[expect]})와 다릅니다.**`}`,
  '',
  '```',
  ...detail,
  '```',
  '',
]);

process.exit(ok ? 0 : (run.status ?? 1));
