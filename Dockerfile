# Многоступенчатая сборка: node собирает статический бандл (Vite PWA),
# nginx раздаёт готовый dist. Итоговый образ — только nginx + статика.

FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11
# Сначала только манифесты — слой с зависимостями кэшируется между сборками.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
