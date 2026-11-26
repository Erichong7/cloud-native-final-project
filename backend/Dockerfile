# ---------- 1단계: 빌드 (JDK + Gradle wrapper) ----------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# 빌드 설정을 먼저 복사해서 의존성 다운로드 레이어를 캐시 (소스만 바뀌면 재사용)
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon > /dev/null

COPY src src
RUN ./gradlew bootJar --no-daemon -x test

# ---------- 2단계: 실행 (JRE만 포함해서 이미지 크기 축소) ----------
FROM eclipse-temurin:21-jre
WORKDIR /app

RUN useradd --create-home appuser
COPY --from=build /app/build/libs/*.jar app.jar
USER appuser

EXPOSE 8080

# 컨테이너 메모리 limit의 75%까지 힙으로 사용 (K8s resources.limits.memory 기준)
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
