// 파드 안에서 실행하는 탐침. 결과를 한 줄로 출력한다.
//   node - http <기준 URL> <경로> [사용자 비밀번호]   → HTTP 상태 코드, 또는 TIMEOUT / REFUSED
//   node - tcp <주소> <포트>                          → CONNECTED / REFUSED / TIMEOUT
// TIMEOUT은 응답이 전혀 없었다는 뜻이고(정책이 패킷을 버림), REFUSED는 상대가 거절 응답을 보냈다는 뜻이다(포트가 닫힘).
const net = require('node:net');

const TIMEOUT_MS = 3000;

function netResult(e) {
  const code = e?.cause?.code ?? e?.code;
  if (code === 'ECONNREFUSED') return 'REFUSED';
  if (e?.name === 'TimeoutError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'TIMEOUT';
  return `ERROR:${code ?? e?.name}`;
}

async function http(base, path, username, password) {
  let cookie;
  if (username) {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 200) return `LOGIN_${res.status}`;
    cookie = res.headers.get('set-cookie').split(';')[0];
  }
  const res = await fetch(`${base}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return String(res.status);
}

function tcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port) });
    socket.setTimeout(TIMEOUT_MS, () => { socket.destroy(); resolve('TIMEOUT'); });
    socket.on('connect', () => { socket.destroy(); resolve('CONNECTED'); });
    socket.on('error', (e) => resolve(netResult(e)));
  });
}

const [mode, ...args] = process.argv.slice(2);
const run = mode === 'http' ? http(...args) : mode === 'tcp' ? tcp(...args) : Promise.resolve('ERROR:usage');
run.catch(netResult).then((result) => { console.log(result); process.exit(0); });
