FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# API base URL baked in at build time.
# Must NOT include the /api suffix — endpoint paths already carry it (e.g. /api/auth/login).
# Default is empty so the nginx reverse-proxy path (/api/*) works when no override is given.
ARG VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_APP_NAME=UniFT
ARG VITE_APP_VERSION=0.0.1
ARG VITE_ENABLE_DARK_MODE=true

RUN npm run build

FROM nginx:1.27-alpine

RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
