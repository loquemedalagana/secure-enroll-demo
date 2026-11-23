// 필수 환경 변수가 없으면 기본값으로 대신하지 않고 시작을 거부한다(fail-closed).
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}이(가) 설정되지 않았습니다. .env.example을 참고하세요.`);
  return value;
}

// 서명 키는 없을 때뿐 아니라 너무 짧을 때도 시작을 거부한다. 값 자체는 오류 문구에 넣지 않는다.
const MIN_SECRET_LENGTH = 32;

export function requireSecret(name: string): string {
  const value = requireEnv(name);
  if (value.length < MIN_SECRET_LENGTH) throw new Error(`${name}은(는) ${MIN_SECRET_LENGTH}자 이상이어야 합니다.`);
  return value;
}
