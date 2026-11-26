// node --test(spec 형식)의 출력에서 건수와 실패한 테스트 이름을 읽는다.
// 실패한 이유(비교한 값)는 읽지 않는다. 요약에 값이 옮겨지지 않게 하기 위해서다.
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
  const head = text.split('✖ failing tests:')[0];
  const failed = [...head.matchAll(/^✖ (.+?) \(\d+(?:\.\d+)?ms\)$/gm)].map((found) => found[1]);
  return { tests, pass, fail, failed };
}

// 실패한 테스트 이름을 표로 만든다.
export function failedTable(failed) {
  return ['| 실패한 테스트 |', '|---|', ...failed.map((name) => `| ❌ ${name.replaceAll('|', '\\|')} |`)];
}
