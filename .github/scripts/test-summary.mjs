// node --test의 출력에서 건수와 실패한 테스트 이름만 뽑아 작업 요약(GITHUB_STEP_SUMMARY)에 쓴다.
// 실패한 이유(비교한 값)는 옮기지 않는다. 값이 요약에 남지 않게 하기 위해서다.
//
// 사용법: node .github/scripts/test-summary.mjs <제목> <테스트 출력 파일>
//   GITHUB_STEP_SUMMARY가 없으면 표준 출력에 쓴다.
// 이 스크립트는 요약만 만든다. 테스트의 성공과 실패는 테스트 단계의 종료 코드가 정한다.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [title, file] = process.argv.slice(2);
if (!title || !file) {
  console.error('사용법: node .github/scripts/test-summary.mjs <제목> <테스트 출력 파일>');
  process.exit(2);
}

function build() {
  if (!existsSync(file)) return ['테스트 출력 파일이 없습니다. 테스트 단계가 실행되지 않았습니다.'];
  const text = readFileSync(file, 'utf8');

  const count = (name) => {
    const found = text.match(new RegExp(`^ℹ ${name} (\\d+)$`, 'm'));
    return found ? Number(found[1]) : null;
  };
  const tests = count('tests');
  const pass = count('pass');
  const fail = count('fail');
  if (tests === null || pass === null || fail === null) {
    return ['테스트 결과의 건수를 읽지 못했습니다. 이 잡의 로그를 확인하세요.'];
  }
  if (fail === 0) return [`${tests}건 모두 통과`];

  // 실패한 테스트의 이름은 "✖ failing tests:" 앞에 한 번씩 나온다. 끝의 걸린 시간은 뺀다.
  const head = text.split('✖ failing tests:')[0];
  const names = [...head.matchAll(/^✖ (.+?) \(\d+(?:\.\d+)?ms\)$/gm)].map((found) => found[1]);
  return [
    `${tests}건 중 ${pass}건 통과, **${fail}건 실패**`,
    '',
    '| 실패한 테스트 |',
    '|---|',
    ...names.map((name) => `| ${name.replaceAll('|', '\\|')} |`),
    ...(names.length === fail ? [] : ['', `이름을 읽은 것은 ${names.length}건입니다. 나머지는 이 잡의 로그를 확인하세요.`]),
  ];
}

const report = [`### ${title}`, '', ...build(), ''].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
else console.log(report);
