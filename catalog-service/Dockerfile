FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
# Run as a non-root user (DS-0002): the service only reads its immutable jar. Port is >1024 so a
# non-root process can bind it.
RUN useradd -r -u 10001 appuser
USER appuser
EXPOSE 8090
ENTRYPOINT ["java", "-jar", "app.jar"]
