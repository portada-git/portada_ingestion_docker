ARG ARG_VITE_API_BASE_URL

# Stage 1: Build
FROM node:20-alpine AS builder

ARG ARG_VITE_API_BASE_URL

ENV VITE_API_BASE_URL=${ARG_VITE_API_BASE_URL}

RUN echo "|=====> ${VITE_API_BASE_URL:-EMPTY}"

WORKDIR /app
RUN npm install -g bun

COPY package.json bun.lock* ./
RUN bun install

COPY . .

RUN bun run build

# Stage 2: Serve
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]