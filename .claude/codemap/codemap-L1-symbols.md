---
name: codemap-l1-symbols
description: "Codebase map L1 — on-demand per-service symbol map for quick-ecommerce (key classes → role → path, REST entrypoints; no method bodies). NOT auto-loaded; read when [[codemap-L0-orientation]]'s \"where is X\" index doesn't pinpoint the file. Built by /codemap from f740ff5."
metadata: 
  node_type: memory
  type: project
  originSessionId: 487b2550-6756-4de6-8e79-62fc5a1f1a63
---

Per-service class → role → path. Signatures only, no bodies (read a *slice* of source for logic).
Paths are under `<service>/src/main/java/com/varsha/<svc>/`. Conventions every service shares:
`<Svc>Application` (bootstrap), `config/AdminRoleFilter` (defense-in-depth admin gate behind gateway),
`exception/GlobalExceptionHandler` (RFC-7807 errors), `dto/*`, `model/*`. Only the distinctive classes are listed below.
**Observability (cross-cutting, all 7 app svcs):** `config|filter/UserIdMdcFilter` — puts the **hashed** user_id into MDC for PII-safe logs (never the raw id/email/phone); OTel/Micrometer tracing + metric histograms configured in each `application.yml` (no per-svc class). Business meters live in the services that own the signal (see auth/payment/order below). [[observability-tracing-pillar]]

## auth-service (`/auth`, port 8081, authdb + redis for OTP)
- AuthController — REST `/auth/**`: guest JWT, **register**, **login**, **otp/request**, **otp/verify**, validate (gateway calls this), me, me/display-name — `controller/AuthController.java`
- JwtService — HS256 mint/validate, 24h expiry; self-registered ids namespaced `usr-<uuid>` (non-guest) — `service/JwtService.java`
- UserService — login/signup, Google OAuth2, password (BCrypt) register/verify, findOrCreateByPhone; ADMIN role from ADMIN_EMAILS; emits `signups{method=email|phone}` meter on register — `service/UserService.java`
- OtpService — 6-digit OTP: hashed in Redis, TTL 300s, attempt cap + resend throttle; dev-echo when OTP_DEV_ECHO=true — `service/OtpService.java`
- OtpRepository — Redis OTP/attempt/resend keys (SETNX-with-TTL) — `repository/OtpRepository.java`
- sms/SmsSender (iface) + LoggingSmsSender — dev SMS stub (logs/echoes code); real provider drops in behind config at go-live — `service/sms/`
- CryptoConfig — standalone BCryptPasswordEncoder bean (breaks SecurityConfig↔UserService cycle) — `config/CryptoConfig.java`
- DuplicateAccountException — register conflict (409) — `service/`
- OAuth2SuccessHandler / SecurityConfig — OAuth2 flow + permitAll for new auth endpoints — `config/`
- User (phone + passwordHash, nullable email) / UserRepository (findByEmail/findByPhone) — `model/`, `repository/`

## catalog-service (`/api/catalog`, port 8090, catalogdb + redis + minio + opensearch) — the hub
- CatalogController — `/api/catalog/products` (browse `?size=`, `/{id}`, `/search`, `/{id}/recommendations`); admin: GET `/admin/products` (all incl. inactive), **PATCH `/admin/products/active`** (bulk enable/disable), POST/PUT `/admin/products`(+`/{id}`), POST `/admin/products/{id}/image` — `controller/CatalogController.java`
- CatalogService — product CRUD + orchestration — `service/CatalogService.java`
- ProductReader — read-only product fetch (findByIds rank-preserving, category fallback) — `service/ProductReader.java`
- ProductCacheService — Redis read-through (browse/detail) — `service/ProductCacheService.java`
- ProductSearchService — OpenSearch index + `more_like_this`; ILIKE degradation; `buildQuery` = fuzzy OR phrase_prefix (type-ahead, min_should_match=1) — `search/ProductSearchService.java`
- SearchBackfillRunner — startup index backfill — `search/SearchBackfillRunner.java`
- RecommendationService — co-purchase + content blend, category fallback, never-503 — `service/RecommendationService.java`
- OrderClient — best-effort outbound → order-service co-purchase (catalog's 1st outbound call) — `client/OrderClient.java`
- ObjectStorageService — MinIO S3 image upload — `service/ObjectStorageService.java`
- SeedImageInitializer — seed product images — `service/SeedImageInitializer.java`
- NotifyController — `/api/catalog/notify` (public launch-interest signup), `/api/catalog/admin/notify` (ADMIN list) — `controller/NotifyController.java`
- NotifyService — save/list signups (Flyway V4 `notify_signups`) — `service/NotifyService.java`; NotifySignup + NotifySignupRepository; dto NotifyRequest/Response
- Configs: CacheConfig, RecommendationConfig (RestClient bean), StorageConfig, OpenSearchConfig, LoggingCacheErrorHandler, AdminRoleFilter
- Product/ProductType/Variant + ProductRepository; dto: ProductRequest/Response, VariantRequest/Response, **BulkActiveRequest** (bulk active-toggle ids), CachedPage

## cart-service (`/api/cart`, port 8091, Redis only)
- CartController — `/api/cart` get, `/api/cart/items` add — `controller/CartController.java`
- CartService — add/remove lines, snap price/name from catalog — `service/CartService.java`
- CartRepository — Redis JSON persistence — `repository/CartRepository.java`
- CatalogClient — outbound → catalog `/{id}` for price/name; ProductView — `client/`
- Cart/CartItem; dto AddItemRequest; AppConfig (WebClient)

## inventory-service (`/api/inventory`, port 8092, inventorydb + redis ATP)
- InventoryController — `/stock/{sku}` GET, `/admin/stock` GET+POST (+N restock), **`/atp/reserve`** (fast pre-check), `/reservations` reserve + `/{orderId}/commit` + `/{orderId}/release` (saga-driven) — `controller/InventoryController.java`
- InventoryService — reserve/commit/release stock ops; DB `PESSIMISTIC_WRITE` lock = durable authoritative oversell guard — `service/InventoryService.java`
- **AtpService — Redis available-to-promise: `atp:{sku}` counter mirrors sellable qty, atomic Lua decrement = fast early oversell reject (409); DEGRADED when Redis down/counter missing → DB guard decides; release/+N credit ATP back** — `service/AtpService.java`
- **AtpBackfillRunner — startup: seed `atp:{sku}` counters from DB stock levels** — `config/AtpBackfillRunner.java`
- StockItem / Reservation / ReservationLine / ReservationStatus — `model/`
- StockItemRepository / ReservationRepository — `repository/`; dto Dtos (incl. AtpResult); AdminRoleFilter; exception/{GlobalExceptionHandler, InventoryExceptions}

## payment-service (`/api/payments`, port 8093, paymentdb)
- PaymentController — `/api/payments/charge`, `/{orderId}` status — `controller/PaymentController.java`
- PaymentService — provider dispatch (PAYMENT_PROVIDER env); emits `payment_attempts{provider,status}` meter — `service/PaymentService.java`
- provider/: PaymentProvider (iface), MockPaymentProvider, CodPaymentProvider, ChargeOutcome
- Payment/PaymentStatus + PaymentRepository

## order-service (`/api/orders`, port 8094, orderdb + outbox) — the saga owner
- OrderController — `/api/orders/checkout` (idempotent, Idempotency-Key), `/{orderId}`, list — `controller/OrderController.java`
- AdminOrderController — `/admin/orders` list + mark-delivered (ADMIN) — `controller/AdminOrderController.java`
- RecommendationDataController — `/api/orders/products/{id}/co-purchase` (data for catalog recs) — `controller/RecommendationDataController.java`
- SagaOrchestrator — checkout state machine: inventory→payment→confirm/compensate; emits `gmv_rupees` + `order_saga` Timer + `orders_finalized{status}` meters — GMV/timer ONLY on CONFIRMED (no double-count) — `service/SagaOrchestrator.java`
- CheckoutService — checkout entry + idempotency; emits `orders_placed` meter at checkout — `service/CheckoutService.java`
- OutboxPoller — drains OutboxEvent (durable saga events) — `service/OutboxPoller.java`
- InventoryClient / PaymentClient / ClientExceptions — outbound saga calls — `client/`
- Order/OrderItem/OrderStatus/DeliveryStatus/OutboxEvent/OutboxStatus — `model/`
- OrderRepository (incl. co-purchase self-join), OutboxRepository — `repository/`; AppConfig (WebClient, outbox poll); exception/{GlobalExceptionHandler, OrderExceptions} — checkout guard 403 (login-required) + 409 (oversell/idempotency)

## videocall-service (`/api/videocall`, port 8095, videocalldb + redis) — gated-call enforcement brain
- VideocallController — `/api/videocall/eligibility` (POST, Tally upsert), `/grant` (POST, mint call grant), `/admin/eligibility` (GET, ADMIN roster) — `controller/VideocallController.java`
- VideocallService — eligibility + grant orchestration; default-deny `{available:false}` (guest/not-eligible/cooldown indistinguishable) — `service/VideocallService.java`
- GrantService — signs the SHORT-LIVED call grant (VIDEOCALL_GRANT_SECRET, distinct from JWT_SECRET; claims aud=videocall-grant, roomId, maxParticipants:3, exp=iat+600) — `service/GrantService.java`
- CooldownRepository — Redis `videocall:cd:{userId}` 5h TTL, atomic SETNX (closes double-issue TOCTOU) — `repository/CooldownRepository.java`
- EligibilityRepository / Eligibility — `repository/`, `model/` (Flyway V1 `videocall_eligibility`)
- IceServersConfig — hands STUN/TURN config to the browser — `config/`; dto Dtos; exception/{GlobalExceptionHandler,VideocallExceptions}

## signaling-service (Node + Socket.IO, port 3001, no DB) — vendored WebRTC mesh signaling
- index.ts — express + Socket.IO bootstrap; `io.use` grant-verify middleware + per-socket kill-timer at grant exp
- auth.ts — fail-closed grant verify: pins HS256, requires aud=videocall-grant + exp + roomId (no alg:none/confusion) — `src/auth.ts`
- handlers/signaling.ts — SDP/ICE relay (offer/answer/candidate); join-room rejects roomId ≠ grant.roomId
- roomManager.ts — MAX_PARTICIPANTS=3 room state; 4th join → room-full — `src/roomManager.ts`
- logger.ts — structured logs; tests in `src/__tests__/` (auth, roomManager, signaling.integration — the WS/max-3/kill-timer coverage)
- tracing.ts — OTel Node SDK + auto-instrumentations; spans join the same W3C trace.id (OTLP → apm-server), imported first in `index.ts`
> coturn/ — TURN/STUN relay container (config `coturn/turnserver.conf`); STUN-only locally, host ports 3478 udp/tcp.

## gateway (port 8443 TLS, edge) — order matters (filters are global)
- AuthFilter — GlobalFilter: validate Bearer, inject X-User-*, gate ADMIN_PATHS, strip client identity headers — `filter/AuthFilter.java`
- RateLimitFilter — token-bucket per IP (XFF opt-in) — `filter/RateLimitFilter.java`
- SecurityHeadersFilter — HSTS/CSP/X-Frame — `filter/SecurityHeadersFilter.java`
- BulkheadFilter — Resilience4j concurrency caps — `filter/BulkheadFilter.java`
- (the old `CorrelationIdFilter` was **deleted** in the tracing pillar — Micrometer/OTel now auto-propagates the W3C trace.id across the reactive gateway + every RestClient hop; same for auth's removed `CorrelationIdFilter`/`MdcFilter`)
- HealthController; FallbackController (`/fallback/unavailable`, circuit-breaker fallback)
- Routes + resilience4j config in `gateway/src/main/resources/application.yml`

## frontend (React/Vite SPA, served same-origin via gateway `/**`)
- App.tsx — shell: Gen-Z storytelling home (Hero/TrustBand/HoneyTeaser/SocialProof) + **Catalogue v2** discovery (CatalogControls toolbar drives client-side query/category/sort/giOnly/labOnly/maxPrice via `displayed` useMemo filter→sort) + **RecommendedRow** (home recs seeded by last-viewed), slide-overs (cart, detail, **profile**), AuthModal, VideoCall FAB + CallRoom (`?call=` invite), Coming-Soon + Notify modals; order-status auto-poll (4s while PENDING), client-side wishlist
- api.ts — HTTP client: getProducts(`?size=200`), getProductById, searchProducts (OpenSearch, **retained but unwired** — grid now filters client-side), getRecommendations, cart, checkout, getOrders/getProfile; **auth** register/login/requestOtp/verifyOtp/logout (JWT under `qe.guestToken`); **videocall** recordEligibility/requestGrant; notify signup
- **Catalogue v2 (12 Jun 2026):** CatalogControls (sticky `top:64px` toolbar — category pills `role=tab`, inline live SearchBar, sort newest/price↑↓, collapsible GI/Lab/price facets, `aria-live` count) · ProductCard (editorial provenance: GI ✓ + Lab-tested chips, origin, farm, "N grades"; honey branch unchanged → ComingSoon/Notify) · ProductDetail (`onAdd(product, qty?)`, qty stepper, INDICATIVE grade select — variant NEVER a cart-line key, image-lightbox zoom) · RecommendedRow (home strip, returns null when empty)
- components/: ProductGrid, ProductCard, ProductDetail, RecommendedRow, CatalogControls, CartDrawer, **ProfileDrawer** (Profile/Orders/Address/Wishlist + sign-in/out), Header (search props removed — moved to toolbar), SearchBar, AuthModal (Login·Register·Phone-OTP), NotifyModal/NotifyForm, ComingSoonModal, UpdatesCarousel, **Hero/TrustBand/HoneyTeaser/SocialProof** (Gen-Z home), **VideoCall/{CallRoom, VideoCallGateModal}**
- hooks/useWebRTC.ts — WebRTC peer mesh (socket.io-client through wss://:8443/socket.io); lib/videoCall.ts — grant/room helpers; lib/{comingSoon,updates,wishlist,**provenance** (isGiTagged/isLabTested),**recentlyViewed** (qe.lastViewed)}.ts — localStorage/derive helpers
- types.ts — Product/CartItem/Order/Delivery + OrderSummary/OrderLine, UserProfile, WishlistItem unions; config.ts — runtime config

## admin-app (React/Vite multi-page SPA, loopback 127.0.0.1:5174, nginx basic-auth perimeter)
- App.tsx + main.tsx — React-Router shell; pages: **Login** (authdb `/auth/login`, field is `identifier` not `email` [[admin-login-credential-gotcha]]), **Dashboard**, **Orders** (list/filter/mark-delivered → `/admin/orders`), **products/Products** (all incl. inactive, enable/disable, active-first) + **products/ProductForm** (create/edit + image upload), **inventory/Inventory** (stock + `+N` restock → `/admin/stock`)
- stores/authStore.ts — Zustand JWT/role store; auth/permissions.ts — role-gated capability map
- components/{Layout, ProtectedRoute, RoleGate} + components/ui/* (shadcn: badge/button/card/dialog/input/label/select/table)
- api/{auth,catalog,inventory,orders}.ts — per-domain clients; lib/{axios (JWT in **X-Access-Token** — nginx rebuilds Authorization so basic-auth survives [[admin-basic-bearer-header-collision]]), jwt, format, queryClient, utils}.ts; types.ts

## legacy (NOT in compose runtime — ignore for runtime questions)
- `backend/` `com.example.ecommerce.*` — original single-module monolith (commit 47bfe3b), superseded by the microservices above.
