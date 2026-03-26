# ============================================================
#  UniFT — Single-Container Multi-Stage Build
#
#  Stage 1: Build the React frontend (Node.js)
#  Stage 2: Build the Spring Boot backend (Gradle), embedding
#            the frontend dist as classpath:/static/ resources
#  Stage 3: Minimal JRE runtime image — single JAR, single port
#
#  Usage:
#    docker build -t unift:latest .
#    docker run -p 8080:8080 --env-file .env unift:latest
#
#  The resulting container serves:
#    - React SPA at  http://localhost:8080/
#    - REST API at   http://localhost:8080/api/
#    - Terminal WS   http://localhost:8080/api/ws/terminal/
#    - Swagger UI    http://localhost:8080/swagger-ui.html
# ============================================================

#  Stage 1 — Frontend build
FROM node:22-alpine AS frontend-builder

WORKDIR /app/fe

# Install dependencies before copying source so the layer is cached
COPY unift-fe/package*.json ./
RUN npm ci

COPY unift-fe/ .

# VITE_API_BASE_URL is intentionally left empty so all /api/* calls
# resolve relative to the current origin (handled by Spring Boot itself).
ARG VITE_API_BASE_URL=
ARG VITE_APP_NAME=UniFT
ARG VITE_APP_VERSION=1.1.0
ARG VITE_ENABLE_DARK_MODE=true

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_ENABLE_DARK_MODE=$VITE_ENABLE_DARK_MODE

RUN npm run build


#  Stage 2 — Backend build (with frontend embedded)
FROM openjdk:24-ea-jdk-slim AS backend-builder

ENV GRADLE_VERSION=8.7

RUN apt-get update && apt-get install -y curl unzip --no-install-recommends \
    && curl -sLO https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip \
    && unzip gradle-${GRADLE_VERSION}-bin.zip -d /opt \
    && ln -s /opt/gradle-${GRADLE_VERSION}/bin/gradle /usr/bin/gradle \
    && rm -rf /var/lib/apt/lists/* gradle-${GRADLE_VERSION}-bin.zip

WORKDIR /app

# Copy backend source
COPY unift/ .

# Embed the compiled frontend into Spring Boot's static resource directory.
# Spring Boot serves classpath:/static/ automatically — no extra config needed.
COPY --from=frontend-builder /app/fe/dist ./src/main/resources/static/

RUN chmod +x gradlew
RUN ./gradlew clean build -x test --no-daemon


#  Stage 3 — Runtime
FROM openjdk:24-ea-jdk-slim AS runtime

RUN apt-get update && apt-get install -y curl --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-builder /app/build/libs/*.jar app.jar

# Document the port — does not publish it (that is docker run -p or compose)
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
