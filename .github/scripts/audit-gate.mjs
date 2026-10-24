// npm audit 결과를 권고 ID(GHSA) 단위로 예외 목록과 대조하는 CI 게이트.
// 실패 조건: (1) 예외 목록에 없는 high 이상 권고 (2) 만료된 예외 (3) audit 실행·파싱 실패(fail-closed)
// 외부 패키지 없이 Node 내장 모듈만 쓴다.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const GATED = new Set(['high', 'critical']);
const exceptionsPath = process.argv[2] ?? '.github/audit-exceptions.json';
const today = new Date().toISOString().slice(0, 10);

function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // 취약점이 있으면 npm audit은 0이 아닌 코드로 끝난다. JSON 출력이 있으면 그대로 쓴다.
    if (e.stdout) return e.stdout;
    throw e;
  }
}

const report = JSON.parse(runAudit());
if (report.error || !report.vulnerabilities) {
  console.error('npm audit 결과를 읽지 못했습니다. 판단할 수 없으므로 실패로 처리합니다.');
  console.error(JSON.stringify(report.error ?? report).slice(0, 500));
  process.exit(1);
}

// 패키지별 결과의 via에서 실제 권고만 모아 ID로 중복을 없앤다.
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via !== 'object') continue;
    const id = via.url.split('/').pop();
    advisories.set(id, { id, package: via.name, severity: via.severity, title: via.title });
  }
}

const { exceptions } = JSON.parse(readFileSync(exceptionsPath, 'utf8'));
const byId = new Map(exceptions.map((e) => [e.id, e]));

const gated = [...advisories.values()].filter((a) => GATED.has(a.severity));
const unexpected = gated.filter((a) => !byId.has(a.id));
const expired = exceptions.filter((e) => advisories.has(e.id) && e.expires < today);
const stale = exceptions.filter((e) => !advisories.has(e.id));

const counts = {};
for (const a of advisories.values()) counts[a.severity] = (counts[a.severity] ?? 0) + 1;
console.log(`권고 ${advisories.size}건 ${JSON.stringify(counts)} · 게이트 대상(high 이상) ${gated.length}건 · 예외 ${exceptions.length}건`);

for (const a of unexpected) console.error(`✖ 예외 목록에 없는 ${a.severity} 권고: ${a.id} (${a.package}) ${a.title}`);
for (const e of expired) console.error(`✖ 만료된 예외: ${e.id} (${e.package}) 만료일 ${e.expires} — 다시 판단이 필요합니다`);
for (const e of stale) console.warn(`△ 더 이상 보고되지 않는 예외: ${e.id} — 목록에서 지우세요`);

if (unexpected.length || expired.length) process.exit(1);
console.log('✔ high 이상 권고가 모두 유효한 예외로 관리되고 있습니다.');
