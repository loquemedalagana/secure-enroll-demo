// 필수 환경 변수가 없으면 기본값으로 대신하지 않고 시작을 거부한다(fail-closed).
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}이(가) 설정되지 않았습니다. .env.example을 참고하세요.`);
  return value;
}
