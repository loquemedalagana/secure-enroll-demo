// node --test의 출력에서 건수와 실패한 테스트 이름, 실패한 이유의 일부를 뽑아 작업 요약(GITHUB_STEP_SUMMARY)에 쓴다.
// 이유는 테스트에 직접 적은 문구와 숫자끼리의 비교만 옮긴다. 응답의 값은 옮기지 않는다(test-output.mjs).
//
// 사용법: node .github/scripts/test-summary.mjs <제목> <테스트 출력 파일>
//   GITHUB_STEP_SUMMARY가 없으면 표준 출력에 쓴다.
// 이 스크립트는 요약만 만든다. 테스트의 성공과 실패는 테스트 단계의 종료 코드가 정한다.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { failedTable, parseTestOutput } from './test-output.mjs';

const [title, file] = process.argv.slice(2);
if (!title || !file) {
  console.error('사용법: node .github/scripts/test-summary.mjs <제목> <테스트 출력 파일>');
  process.exit(2);
}

function build() {
  if (!existsSync(file)) return ['테스트 출력 파일이 없습니다. 테스트 단계가 실행되지 않았습니다.'];
  const result = parseTestOutput(readFileSync(file, 'utf8'));
  if (result === null) return ['테스트 결과의 건수를 읽지 못했습니다. 이 잡의 로그를 확인하세요.'];
  const { tests, pass, fail, failed, reasons } = result;
  if (fail === 0) return [`${tests}건 모두 통과`];
  return [
    `${tests}건 중 ${pass}건 통과, **${fail}건 실패**`,
    '',
    ...failedTable(failed, reasons),
    ...(failed.length === fail ? [] : ['', `이름을 읽은 것은 ${failed.length}건입니다. 나머지는 이 잡의 로그를 확인하세요.`]),
  ];
}

const report = [`### ${title}`, '', ...build(), ''].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
else console.log(report);
