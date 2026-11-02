# Этап 1: сборка SPA
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Клиент и API на одном адресе: nginx проксирует /api на backend
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Этап 2: раздача статики через nginx
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
