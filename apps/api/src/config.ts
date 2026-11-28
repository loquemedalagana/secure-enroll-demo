// 필수 환경 변수가 없으면 기본값을 쓰지 않고 Error를 던진다. 그래서 API가 시작되지 않는다(fail-closed).
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}이(가) 설정되지 않았습니다. .env.example을 참고하세요.`);
  return value;
}

// 서명 키가 없거나 32자보다 짧으면 Error를 던져 API가 시작되지 않는다. 오류 문구에는 서명 키의 값을 포함하지 않는다.
const MIN_SECRET_LENGTH = 32;

export function requireSecret(name: string): string {
  const value = requireEnv(name);
  if (value.length < MIN_SECRET_LENGTH) throw new Error(`${name}은(는) ${MIN_SECRET_LENGTH}자 이상이어야 합니다.`);
  return value;
}
