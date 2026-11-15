#!/usr/bin/env node
// 두 계층 매트릭스 검증. 저장소 루트에서: node k8s/verify/run.mjs   (먼저 ./k8s/up.sh)
//
// 1) 정책을 내린 상태에서 기준선을 잰다. 나중에 막히는 경로가 원래는 열려 있었음을 확인하기 위해서다.
// 2) 정책을 걸고 매트릭스를 잰다. 줄마다 어느 계층이 판정했는지 본다.
//      네트워크: 요청이 앱에 닿지 못함(TIMEOUT)   앱: 닿았지만 앱이 거부(401/403)   허용: 200
// 3) 네트워크에서 막힌 줄이 Hubble에 '정책 거부'로 남았는지 확인한다. 단순한 시간 초과와 구분하기 위해서다.
// 하나라도 기대와 다르면 종료 코드 1로 끝난다.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 다른 클러스터에 잘못 적용하지 않도록 대상 컨텍스트를 항상 명시한다.
const CONTEXT = process.env.KUBE_CONTEXT ?? 'kind-enroll-lab';
const NS = 'enroll';
const OUTSIDE_NS = 'enroll-outside';
const POLICY_DIR = fileURLToPath(new URL('../policies/', import.meta.url));
const PROBE = readFileSync(new URL('./probe.cjs', import.meta.url));
const SETTLE_MS = 5000;

// lib/data.ts의 더미 계정. 실제 계정이 아니다.
const PASSWORDS = { student1: 'student1-pass', instructor1: 'instructor1-pass', admin1: 'admin1-pass' };

function kubectl(args, input) {
  return execFileSync('kubectl', ['--context', CONTEXT, ...args], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 탐침 스크립트를 표준 입력으로 넘겨 파드 안의 node가 실행하게 한다(파드에 파일을 넣지 않는다).
function probe(ns, target, args) {
  try {
    return kubectl(['-n', ns, 'exec', '-i', target, '--', 'node', '-', ...args], PROBE).split('\n').pop();
  } catch (e) {
    return `EXEC_ERROR:${String(e.stderr ?? e.message).trim().split('\n').pop()}`;
  }
}

const appIP = kubectl(['-n', NS, 'get', 'svc', 'enroll-app', '-o', 'jsonpath={.spec.clusterIP}']);
const gatewayIP = kubectl(['-n', NS, 'get', 'pod', 'gateway', '-o', 'jsonpath={.status.podIP}']);
const apiIP = kubectl(['-n', 'default', 'get', 'svc', 'kubernetes', '-o', 'jsonpath={.spec.clusterIP}']);
const APP = `http://${appIP}:3000`;

const http = (ns, from, user, path) => () => probe(ns, from, ['http', APP, path, ...(user ? [user, PASSWORDS[user]] : [])]);
const tcp = (ns, from, host, port) => () => probe(ns, from, ['tcp', host, String(port)]);

const ADMIN_API = '/api/admin/enrollments';
const netRows = (expected) => [
  { from: 'bystander', who: 'admin1', what: `GET ${ADMIN_API}`, run: http(NS, 'bystander', 'admin1', ADMIN_API), expect: expected.reach, layer: '네트워크' },
  { from: 'outsider (다른 네임스페이스)', who: 'admin1', what: `GET ${ADMIN_API}`, run: http(OUTSIDE_NS, 'outsider', 'admin1', ADMIN_API), expect: expected.reach, layer: '네트워크' },
  { from: 'enroll-app', who: '-', what: '쿠버네티스 API 서버로 TCP 연결', run: tcp(NS, 'deploy/enroll-app', apiIP, 443), expect: expected.api, layer: '네트워크' },
  { from: 'enroll-app', who: '-', what: 'gateway 파드 3000번으로 TCP 연결 (서버 없음)', run: tcp(NS, 'deploy/enroll-app', gatewayIP, 3000), expect: expected.closed, layer: '네트워크' },
];

// 정책이 없을 때: 올바른 관리자 계정이면 어디서든 닿고, 앱도 밖으로 나갈 수 있다. 닫힌 포트는 즉시 거절된다.
const baseline = netRows({ reach: '200', api: 'CONNECTED', closed: 'REFUSED' });

const matrix = [
  { from: 'gateway', who: '비로그인', what: `GET ${ADMIN_API}`, run: http(NS, 'gateway', null, ADMIN_API), expect: '401', layer: '앱' },
  { from: 'gateway', who: 'student1', what: `GET ${ADMIN_API}`, run: http(NS, 'gateway', 'student1', ADMIN_API), expect: '403', layer: '앱' },
  { from: 'gateway', who: 'student1', what: 'GET /api/enrollments/e1 (본인 신청)', run: http(NS, 'gateway', 'student1', '/api/enrollments/e1'), expect: '200', layer: '허용' },
  { from: 'gateway', who: 'student1', what: 'GET /api/enrollments/e2 (남의 신청)', run: http(NS, 'gateway', 'student1', '/api/enrollments/e2'), expect: '403', layer: '앱' },
  { from: 'gateway', who: 'instructor1', what: 'GET /api/enrollments/e3 (다른 강사 강의)', run: http(NS, 'gateway', 'instructor1', '/api/enrollments/e3'), expect: '403', layer: '앱' },
  { from: 'gateway', who: 'admin1', what: `GET ${ADMIN_API}`, run: http(NS, 'gateway', 'admin1', ADMIN_API), expect: '200', layer: '허용' },
  ...netRows({ reach: 'TIMEOUT', api: 'TIMEOUT', closed: 'TIMEOUT' }),
];

function measure(rows) {
  return rows.map((row) => {
    const actual = row.run();
    return { ...row, actual, ok: actual === row.expect };
  });
}

// Hubble에 남아야 하는 차단 기록. 방향은 어느 쪽 정책이 막았는지를 뜻한다(EGRESS=보내는 쪽, INGRESS=받는 쪽).
const expectedDrops = [
  { label: 'bystander → enroll-app:3000', src: 'bystander', dst: 'enroll-app', port: 3000, direction: 'EGRESS' },
  { label: 'outsider → enroll-app:3000', src: 'outsider', dst: 'enroll-app', port: 3000, direction: 'INGRESS' },
  { label: 'enroll-app → 쿠버네티스 API 서버', src: 'enroll-app', dst: 'reserved:kube-apiserver', direction: 'EGRESS' },
  { label: 'enroll-app → gateway:3000', src: 'enroll-app', dst: 'gateway', port: 3000, direction: 'EGRESS' },
];

function readDrops(since) {
  const out = kubectl(['-n', 'kube-system', 'exec', 'ds/cilium', '-c', 'cilium-agent', '--',
    'hubble', 'observe', '--verdict', 'DROPPED', '--last', '500', '-o', 'json']);
  return out.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line).flow)
    .filter((flow) => flow && new Date(flow.time) >= since);
}

function checkDrops(flows) {
  return expectedDrops.map((want) => {
    const hit = flows.find((f) =>
      f.drop_reason_desc === 'POLICY_DENIED' &&
      f.traffic_direction === want.direction &&
      (f.source?.pod_name ?? '').startsWith(want.src) &&
      ((f.destination?.pod_name ?? '').startsWith(want.dst) || (f.destination?.labels ?? []).includes(want.dst)) &&
      (want.port === undefined || f.l4?.TCP?.destination_port === want.port));
    return { ...want, ok: Boolean(hit), reason: hit ? `${hit.drop_reason_desc} (${hit.traffic_direction})` : '기록 없음' };
  });
}

const mark = (ok) => (ok ? '✅' : '❌');
const table = (rows) => [
  '| 출발지 | 사용자 | 요청 | 판정 계층 | 기대 | 실제 | |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.from} | ${r.who} | ${r.what} | ${r.layer} | ${r.expect} | ${r.actual} | ${mark(r.ok)} |`),
].join('\n');

// 어떤 클러스터에서 돌렸는지 남긴다. 실행 기록만 보고도 노드와 버전을 알 수 있게 하기 위해서다.
function environment() {
  const node = kubectl(['get', 'nodes', '-o',
    'jsonpath={range .items[*]}{.metadata.name}  Kubernetes {.status.nodeInfo.kubeletVersion}  {.status.nodeInfo.containerRuntimeVersion}  {.status.nodeInfo.osImage}{"\\n"}{end}']);
  const cilium = kubectl(['-n', 'kube-system', 'get', 'ds', 'cilium', '-o', 'jsonpath={.spec.template.spec.containers[0].image}']);
  const pods = [NS, OUTSIDE_NS].map((ns) =>
    kubectl(['-n', ns, 'get', 'pods', '-o',
      'jsonpath={range .items[*]}{.metadata.namespace}/{.metadata.name}  {.status.phase}  {.status.podIP}  {.spec.nodeName}{"\\n"}{end}'])).join('\n');
  return ['노드', node, '', 'Cilium', cilium.split('@')[0], '', '파드 (네임스페이스/이름  상태  IP  노드)', pods].join('\n');
}

// --- 실행 ---
const env = environment();
kubectl(['delete', '-f', POLICY_DIR, '--ignore-not-found']);
await sleep(SETTLE_MS);
const before = measure(baseline);

kubectl(['apply', '-f', POLICY_DIR]);
await sleep(SETTLE_MS);
const since = new Date();
const after = measure(matrix);
await sleep(2000);
const drops = checkDrops(readDrops(since));

const failed = [...before, ...after, ...drops].filter((r) => !r.ok).length;
const report = [
  '## 네트워크 정책 × 앱 인가 매트릭스',
  '',
  `클러스터 \`${CONTEXT}\` · 실행 ${new Date().toISOString()}`,
  '',
  '### 실행 환경',
  '```',
  env,
  '```',
  '',
  '### 1. 기준선 — 정책 없음',
  '나중에 막히는 경로가 정책 전에는 열려 있다.',
  '',
  table(before),
  '',
  '### 2. 정책 적용 후',
  '`TIMEOUT`은 네트워크 정책이, `401`·`403`은 앱의 정책 함수가 거부한 것이다.',
  '',
  table(after),
  '',
  '### 3. Hubble 차단 기록',
  '네트워크에서 막힌 줄이 정책 거부로 기록됐는지 본다.',
  '',
  '| 흐름 | 기대 방향 | 기록 | |',
  '|---|---|---|---|',
  ...drops.map((d) => `| ${d.label} | ${d.direction} | ${d.reason} | ${mark(d.ok)} |`),
  '',
  failed === 0 ? '**결과: 모두 기대와 일치**' : `**결과: ${failed}건이 기대와 다름**`,
  '',
].join('\n');

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
process.exit(failed === 0 ? 0 : 1);
