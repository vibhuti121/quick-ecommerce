---
name: config-agent
description: "Write Spring Security config, application.yml, beans. Trigger: Security config, DB config, OAuth config change needed."
model: sonnet
tools: Read, Grep
---

# Config Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (produced by
> Varsha at Step 0 — see `~/varsha-kit/PROJECT-PROFILE.md`). Take the target service name, its
> detected stack, the base package, and the **permitted paths from the contract/gateway config** —
> never assume FamilyCall's service set or routes. If a needed field is missing, detect it from the
> project and note the gap; don't guess.

**Parent:** Backend Orchestrator
**Single responsibility:** Write SecurityConfig, OAuth2SuccessHandler, GlobalExceptionHandler for one service.

## Input
```
service:         the service named in the task — from the PROFILE `services` list (do NOT assume a fixed set)
permitted_paths: ["/health", ...]   ← the routes that bypass auth, from the contract / gateway config
has_oauth:       true | false
```

## Stack
These templates are JVM/Spring Security. **If the service's detected stack is Node** → wire the
framework's equivalent (Express middleware / Passport, or NestJS guards + an exception filter).
**Otherwise** detect the idiom (Python: FastAPI dependencies + exception handlers; Go: middleware)
and mirror. Never delete the Spring templates — choose by stack.

## SecurityConfig Template (JVM/Spring)

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final OAuth2SuccessHandler successHandler;

    public SecurityConfig(OAuth2SuccessHandler successHandler) {
        this.successHandler = successHandler;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/health", "/auth/validate").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2Login(oauth2 -> oauth2
                .successHandler(successHandler)
            );
        return http.build();
    }
}
```

**Path matching rule:** path in `requestMatchers` must be the EXACT path the controller exposes.
- `/health` permits `GET /health`
- `/auth/validate` permits `GET /auth/validate`
- `/auth/health` is DIFFERENT from `/health` — never conflate

## OAuth2SuccessHandler Template (JVM/Spring, OAuth services only)
The identity entity (`User`), external-id claim (`sub`/`googleId`), and the
`${app.frontend-url}/auth/callback?token=` redirect below are the FamilyCall example — replace the
entity, the provider's claim names, and the callback path with the project's contract values.
```java
@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public OAuth2SuccessHandler(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest req,
            HttpServletResponse res, Authentication auth) throws IOException {
        OAuth2User principal = (OAuth2User) auth.getPrincipal();
        String email = principal.getAttribute("email");
        String googleId = principal.getAttribute("sub");

        User user = userRepository.findByGoogleId(googleId)
                .orElseGet(() -> {
                    User u = new User();
                    u.setGoogleId(googleId);
                    u.setEmail(email);
                    return userRepository.save(u);
                });

        String token = jwtService.generate(String.valueOf(user.getId()), email);
        res.sendRedirect(frontendUrl + "/auth/callback?token=" + token);
    }
}
```

## GlobalExceptionHandler Template

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(
            MethodArgumentNotValidException ex) {
        String msg = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.badRequest().body(Map.of("error", msg));
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<Map<String, String>> handleMissingHeader(
            MissingRequestHeaderException ex) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", "Missing header: " + ex.getHeaderName()));
    }

    @ExceptionHandler(JwtException.class)
    public ResponseEntity<Map<String, String>> handleJwt(JwtException ex) {
        return ResponseEntity.status(401).body(Map.of("error", "Invalid token"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneric(Exception ex) {
        return ResponseEntity.status(500).body(Map.of("error", "Internal server error"));
    }
}
```

## Output
For a JVM/Spring service (`<base-package>` = PROFILE `base-package`; from `pom.xml <groupId>`,
default `com.varsha`):
```
Files written:
  src/main/java/<base-package>/<service>/config/SecurityConfig.java
  src/main/java/<base-package>/<service>/config/OAuth2SuccessHandler.java  (if has_oauth)
  src/main/java/<base-package>/<service>/exception/GlobalExceptionHandler.java
```
For Node / other stacks, write the equivalent security/middleware + error-handler files in the
project's layout (e.g. `src/middleware/auth.ts`, `src/middleware/errorHandler.ts`).

> **Example — FamilyCall (illustrative, not prescriptive):**
> These templates were baked for FamilyCall: the auth-service permits `/health` + `/auth/validate`
> and runs `.oauth2Login()`; its `OAuth2SuccessHandler` does find-or-create on `User.googleId` (from
> the Google `sub` claim), mints a JWT, and redirects to `${app.frontend-url}/auth/callback?token=`.
> For another project (e.g. quick-ecommerce) the same SecurityConfig + handler + advice shapes hold
> with that project's permitted paths, identity entity, and callback URL — read them from the
> contract + gateway config, not from this block.
