FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre
WORKDIR /app
# Dev-only self-signed TLS cert for HTTPS termination at the edge (Phase 3, Pillar 4). This is a
# throwaway localhost cert baked into the image — NOT a production secret. A real deployment mounts
# a CA-signed PKCS12 over /app/keystore.p12 and sets TLS_KEYSTORE_PASSWORD. The keystore password is
# a build ARG so it stays in sync with the runtime ${TLS_KEYSTORE_PASSWORD} (both default to changeit).
# SAN covers localhost + the in-network "gateway" hostname so Prometheus can scrape it over HTTPS.
ARG TLS_KEYSTORE_PASSWORD=changeit
RUN keytool -genkeypair -alias gateway -keyalg RSA -keysize 2048 -validity 825 \
      -storetype PKCS12 -keystore /app/keystore.p12 -storepass "$TLS_KEYSTORE_PASSWORD" \
      -dname "CN=localhost,OU=dev,O=quick-ecommerce,L=Bengaluru,C=IN" \
      -ext "SAN=dns:localhost,dns:gateway,ip:127.0.0.1"
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8443
ENTRYPOINT ["java", "-jar", "app.jar"]
