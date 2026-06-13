# Cloudflare edge config — MaLLADE Phase-0 pilot

Cloudflare gives us a browser-trusted padlock, CDN, free DDoS protection, and hides the
origin IP — at ₹0. The gateway origin uses a **self-signed** cert, which is safe **only**
behind Cloudflare. **Never expose `:8443` raw to the internet** (the bootstrap firewall
already restricts `:8443` to Cloudflare IP ranges).

## Topology
```
browser ──HTTPS(443, CF cert)──▶ Cloudflare edge ──HTTPS(8443, self-signed origin)──▶ VM gateway:8443
```

## One-time setup (founder, in the Cloudflare dashboard)

1. **Add the site** to Cloudflare (free plan) and switch the domain's nameservers at the
   registrar to the two CF nameservers shown. (Founder already owns the domain.)

2. **DNS records** (DNS → Records):
   | Type | Name              | Content (VM public IP) | Proxy status        |
   |------|-------------------|------------------------|---------------------|
   | A    | `@` (apex/domain) | `<VM_PUBLIC_IP>`       | **Proxied** (orange)|
   | A    | `www`             | `<VM_PUBLIC_IP>`       | **Proxied** (orange)|

   The orange cloud is mandatory — it's what terminates the browser-trusted TLS and hides
   the origin IP. A grey cloud (DNS-only) would expose `:8443`'s self-signed cert to browsers
   (untrusted padlock) AND leak the origin IP.

3. **SSL/TLS → Overview → Encryption mode: `Full`.**
   - `Full` = CF→origin over HTTPS, accepting the origin's self-signed cert. This is what we want.
   - NOT `Full (strict)` — that would reject the self-signed origin cert.
   - NOT `Flexible` — that talks plain HTTP to the origin; our gateway only speaks HTTPS on 8443.

4. **Origin port.** Cloudflare's free plan proxies these origin ports: 443, 2053, 2083, 2087,
   2096, **8443**. We use **8443**, so no extra config — CF auto-connects to the origin on the
   same port range. (If you ever move the gateway off 8443, pick another supported port; 8080/80
   are HTTP-only on CF free and won't work with our HTTPS origin.)

   To force CF→origin on 8443 explicitly, the host's gateway must listen on 8443 (it does:
   `GATEWAY_PORT=8443`). CF maps inbound 443 → origin 8443 automatically when the A record host
   is reached on a CF HTTPS port; if you see connection errors, add a **Cloudflare Origin Rule**
   rewriting the destination port to 8443.

5. **Always Use HTTPS** (SSL/TLS → Edge Certificates): ON. Redirects http→https at the edge.

6. (Optional, recommended) **WAF / Security level: Medium**, and a rate-limiting rule are free-tier
   friendly extras. Not required for go-live.

## Verify the trusted padlock (after DNS propagates, ~1–30 min)
```bash
# Real browser-trusted cert (NO -k):
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://<DOMAIN>/actuator/health
#   expect: 200 0      (ssl_verify_result 0 = trusted chain)

# Issuer should be Cloudflare/Google Trust Services, NOT "CN=localhost" (the origin self-sign):
echo | openssl s_client -connect <DOMAIN>:443 -servername <DOMAIN> 2>/dev/null | openssl x509 -noout -issuer
```
Then open `https://<DOMAIN>/` in a browser and confirm the padlock with no warning.

## Free uptime monitor (step 10)
- **UptimeRobot** (free): HTTP(s) monitor, 5-min interval, URL `https://<DOMAIN>/actuator/health`,
  keyword `UP`. Or use **Cloudflare Health Checks** (free tier: one check) on `/` or
  `/actuator/health`. Alert to the founder's email.
