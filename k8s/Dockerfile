# 로컬·CI 러너의 kind 클러스터에 올리기 위한 이미지다. 레지스트리에 푸시하지 않는다.
# 빌드: docker build -f k8s/Dockerfile -t secure-enroll-demo:kind .   (저장소 루트에서)
#
# 베이스 이미지는 다이제스트로 고정한다. 태그는 사람이 읽기 위한 표기이고, 실제로 받는 것은 다이제스트가 정한다.
# 다이제스트는 amd64·arm64 매니페스트를 함께 가리키는 인덱스 값이라 로컬(arm64)과 러너(amd64)에서 같은 줄을 쓴다.
FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 의존성 계층을 소스보다 먼저 만든다. 설치는 잠금 파일 그대로(npm ci).
COPY package.json package-lock.json ./
RUN npm ci

# 복사 대상은 k8s/Dockerfile.dockerignore 의 허용 목록이 정한다(.env, .git, 테스트는 들어오지 않는다).
COPY . .
RUN npm run build && npm prune --omit=dev


FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
WORKDIR /app
# 빌드 중에도, 실행 중에도 외부로 통계를 보내지 않는다.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/package.json /app/next.config.js ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next

# SESSION_SECRET 은 이미지에 넣지 않는다. 실행할 때 주입하고, 없으면 앱이 서명을 거부한다(lib/session.ts).
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
