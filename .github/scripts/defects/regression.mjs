// 회귀 테스트가 결함을 잡는지 확인한다.
// 결함 태그의 코드에 수정 태그의 테스트를 돌린 출력을 읽어, 실패가 있어야 통과로 본다.
// 수정 태그의 코드에 같은 테스트를 돌린 출력은 실패가 없어야 통과로 본다.
//
// 사용법: node .github/scripts/defects/regression.mjs <결함 번호> <defect|fix> <테스트 출력 파일>
// 테스트 출력 자체는 화면에 옮기지 않는다. 실패한 이유에 응답의 값이 찍힐 수 있어서다. 건수와 이름만 옮긴다.
import { appendFileSync, readFileSync } from 'node:fs';
import { failedTable, parseTestOutput } from '../test-output.mjs';

const [number, state, file] = process.argv.slice(2);
if (!/^\d+$/.test(number ?? '') || !['defect', 'fix'].includes(state) || !file) {
  console.error('사용법: node .github/scripts/defects/regression.mjs <결함 번호> <defect|fix> <테스트 출력 파일>');
  process.exit(2);
}

function finish(lines, code) {
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`);
  process.exit(code);
}

const what = state === 'defect' ? `결함 태그 \`v2-defect-${number}\`의 코드` : `수정 태그 \`v2-fix-${number}\`의 코드`;
const title = `**${what}에 수정 태그의 테스트 실행**`;
const result = parseTestOutput(readFileSync(file, 'utf8'));
if (result === null) finish([title, '', '⚠️ 테스트 결과의 건수를 읽지 못했습니다.'], 2);

const { tests, pass, fail, failed } = result;
if (state === 'defect') {
  // 결함이 있는 코드에서는 그 결함을 잡는 테스트가 실패해야 한다. 하나도 실패하지 않으면 회귀 테스트가 결함을 잡지 못하는 것이다.
  // 표시는 테스트의 결과를 그대로 따른다(실패는 ❌, 통과는 ✅). 기대와 같은지는 글로 적는다.
  const ok = fail > 0;
  finish(
    ok
      ? [title, '', `❌ ${tests}건 중 ${fail}건 실패. 결함이 있는 코드이므로 기대한 결과입니다.`, '', ...failedTable(failed)]
      : [title, '', `✅ ${tests}건 모두 통과. ⚠️ **기대와 다릅니다.** 회귀 테스트가 이 결함을 잡지 못합니다.`],
    ok ? 0 : 1,
  );
}
const ok = fail === 0;
finish(
  ok
    ? [title, '', `✅ ${tests}건 모두 통과. 기대한 결과입니다.`]
    : [title, '', `❌ ${tests}건 중 ${pass}건 통과, ${fail}건 실패. ⚠️ **기대와 다릅니다.**`, '', ...failedTable(failed)],
  ok ? 0 : 1,
);
