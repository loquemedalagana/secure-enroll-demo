// node --test(spec 형식)의 출력에서 건수, 실패한 테스트 이름, 실패한 이유의 일부를 읽는다.
// 이유는 두 가지만 읽는다. 요약에 응답의 값이 옮겨지지 않게 하기 위해서다.
// - 테스트 코드에 직접 적은 문구(출력에 generatedMessage: false로 표시된다)
// - 숫자, null, true, false끼리의 비교 한 줄(예: 1 !== 0)
// 객체나 문자열을 비교한 내용, 스택은 읽지 않는다.
const NAME = /^✖ (.+?) \(\d+(?:\.\d+)?ms\)$/;
const PLAIN = '(?:-?\\d+(?:\\.\\d+)?|null|undefined|true|false)';
const COMPARISON = new RegExp(`^\\s+(${PLAIN} !== ${PLAIN})$`, 'm');
const MESSAGE = /^\s+AssertionError \[ERR_ASSERTION\]: (.+)$/m;

export function parseTestOutput(text) {
  const count = (name) => {
    const found = text.match(new RegExp(`^ℹ ${name} (\\d+)$`, 'm'));
    return found ? Number(found[1]) : null;
  };
  const tests = count('tests');
  const pass = count('pass');
  const fail = count('fail');
  if (tests === null || pass === null || fail === null) return null;

  // 실패한 테스트의 이름은 "✖ failing tests:" 앞에 한 번씩 나온다. 끝의 걸린 시간은 뺀다.
  const [head, tail = ''] = text.split('✖ failing tests:');
  const failed = [...head.matchAll(new RegExp(NAME.source, 'gm'))].map((found) => found[1]);

  // "✖ failing tests:" 뒤에는 실패한 테스트마다 이름과 이유가 이어진다.
  const reasons = {};
  let current = null;
  let block = [];
  const close = () => {
    if (current !== null) reasons[current] = reasonOf(block.join('\n'));
  };
  for (const line of tail.split('\n')) {
    const name = line.match(NAME);
    if (name) {
      close();
      current = name[1];
      block = [];
    } else block.push(line);
  }
  close();

  return { tests, pass, fail, failed, reasons };
}

function reasonOf(block) {
  const parts = [];
  const message = block.match(MESSAGE)?.[1];
  // 직접 적은 문구만 옮긴다. 자동으로 만들어진 문구 뒤에는 비교한 값이 이어지므로 옮기지 않는다.
  if (message && /generatedMessage: false/.test(block)) parts.push(message.slice(0, 120));
  const comparison = block.match(COMPARISON)?.[1];
  if (comparison) parts.push(comparison);
  return parts.join(' · ');
}

// 실패한 테스트 이름을 표로 만든다. 읽은 이유가 하나라도 있으면 이유 칸을 붙인다.
export function failedTable(failed, reasons = {}) {
  const cell = (value) => value.replaceAll('|', '\\|');
  if (!failed.some((name) => reasons[name])) return ['| 실패한 테스트 |', '|---|', ...failed.map((name) => `| ❌ ${cell(name)} |`)];
  return [
    '| 실패한 테스트 | 이유 |',
    '|---|---|',
    ...failed.map((name) => `| ❌ ${cell(name)} | ${cell(reasons[name] ?? '')} |`),
  ];
}
