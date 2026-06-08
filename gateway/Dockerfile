FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre
WORKDIR /app
# Dev-only self-signed TLS cert for HTTPS termination at the edge (Phase 3, Pillar 4). The keystore is
# generated at CONTAINER START by docker-entrypoint.sh from the runtime ${TLS_KEYSTORE_PASSWORD}, so the
# password is NEVER baked into a build ARG or image layer / `docker history` (remediates DS-0031). A real
# deployment mounts a CA-signed PKCS12 over /app/keystore.p12 (see the entrypoint). keytool ships in the
# JRE; the SAN covers localhost + the in-network "gateway" hostname so Prometheus can scrape over HTTPS.
COPY --from=build /app/target/*.jar app.jar
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
