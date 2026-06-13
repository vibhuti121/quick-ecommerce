package com.varsha.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.varsha.auth.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;

/**
 * Verifies a Google Sign-In {@code credential} (a Google ID-token JWT) SERVER-SIDE and find-or-creates
 * the matching account. The browser hands us the credential; we never trust it unverified.
 *
 * <p>Verification uses Google's public tokeninfo endpoint over the JDK's built-in {@link HttpClient}
 * (no extra dependency, no google-api-client) and checks: the token is well-formed, {@code aud} equals
 * our configured {@code GOOGLE_CLIENT_ID}, and {@code email_verified} is true. Only then do we mint OUR
 * JWT for the verified email.
 *
 * <p><b>Disabled by default.</b> The founder hasn't created the OAuth client yet, so locally
 * {@code GOOGLE_CLIENT_ID} is unset/blank or the {@code dummy-client-id} placeholder. In that state
 * {@link #isEnabled()} is false and the controller returns a clean 503 — this service must NEVER throw
 * or crash on a Google call when the feature isn't configured.
 */
@Service
public class GoogleAuthService {

    private static final Logger log = LoggerFactory.getLogger(GoogleAuthService.class);
    private static final String TOKENINFO = "https://oauth2.googleapis.com/tokeninfo?id_token=";
    // The compose default placeholder — treated as "not configured" alongside blank/unset.
    private static final String DUMMY = "dummy-client-id";

    private final String clientId;
    private final UserService userService;
    private final ObjectMapper mapper;
    private final HttpClient http;

    public GoogleAuthService(@Value("${app.google.client-id:}") String clientId,
                             UserService userService,
                             ObjectMapper mapper) {
        this.clientId = clientId == null ? "" : clientId.trim();
        this.userService = userService;
        this.mapper = mapper;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    }

    /** True only when a REAL Google client id is configured (not blank, not the dummy placeholder). */
    public boolean isEnabled() {
        return !clientId.isBlank() && !DUMMY.equals(clientId);
    }

    /** A Google-verified profile slice — only the fields we persist. */
    public record GoogleProfile(String email, String name, String picture) {}

    /**
     * Verify the credential with Google and find-or-create the matching account, returning OUR User.
     * Empty if the token is invalid / aud-mismatched / unverified / Google is unreachable. Never throws.
     */
    public Optional<User> verifyAndUpsert(String credential) {
        return verify(credential).map(p -> userService.findOrCreateByGoogleEmail(p.email(), p.name(), p.picture()));
    }

    /**
     * Verify the credential with Google and return the verified profile, or empty if the token is
     * invalid / aud-mismatched / unverified / Google is unreachable. Never throws — a failure is just an
     * empty Optional the controller maps to 401.
     */
    public Optional<GoogleProfile> verify(String credential) {
        if (!isEnabled() || credential == null || credential.isBlank()) {
            return Optional.empty();
        }
        try {
            String url = TOKENINFO + URLEncoder.encode(credential.trim(), StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(3))
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.debug("Google tokeninfo rejected credential: status={}", resp.statusCode());
                return Optional.empty();
            }
            JsonNode node = mapper.readTree(resp.body());

            String aud = node.path("aud").asText("");
            if (!clientId.equals(aud)) {
                log.warn("Google credential aud mismatch (expected our client id)");
                return Optional.empty();
            }
            boolean emailVerified = node.path("email_verified").asBoolean(false)
                    // tokeninfo returns email_verified as the STRING "true" in some responses.
                    || "true".equalsIgnoreCase(node.path("email_verified").asText(""));
            String email = node.path("email").asText("");
            if (!emailVerified || email.isBlank()) {
                log.debug("Google credential not email_verified or missing email");
                return Optional.empty();
            }
            String name = node.path("name").asText(null);
            String picture = node.path("picture").asText(null);
            return Optional.of(new GoogleProfile(email.trim().toLowerCase(), name, picture));
        } catch (Exception e) {
            // Network blip, malformed JSON, interrupt — all collapse to "could not verify".
            log.warn("Google credential verification failed: {}", e.toString());
            return Optional.empty();
        }
    }
}
