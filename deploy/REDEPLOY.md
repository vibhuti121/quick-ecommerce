# Redeploy mallde.in — apne haath se (founder ke liye, simple steps)

Ye guide tab kaam aati hai jab live site **mallde.in** ko dobara deploy / restart karna ho, ya
check karna ho ki sab theek chal raha hai. Sab commands **copy-paste** karne layak hain.

> **Note:** Jab kisi feature ka *naya code* deploy karna ho, wo code pehle server pe pahunchana padta
> hai — wo thoda technical hai (Claude wo part karta hai). Niche wali steps **restart/redeploy +
> verify** ke liye hain, jo aap khud safely kar sakte ho. Naye code ke deploy ke liye Claude ko bolo.

Server: `178.105.223.117`  ·  SSH key: `~/.ssh/familycall_deploy`  ·  domain: **https://mallde.in**

---

## Step 1 — Server me andar jao (SSH)

Apne Mac ke terminal me:

```bash
ssh -i ~/.ssh/familycall_deploy root@178.105.223.117
cd /root/quick-ecommerce
```

Ab aap server ke andar ho. (Bahar aane ke liye kabhi bhi `exit` likhna.)

---

## Step 2 — Deploy / restart chalao

```bash
MALLADE_DOMAIN=mallde.in bash deploy/02-deploy.sh
```

Ye kya karta hai (saral bhasha me):
- Site ke 8 zaroori hisse (gateway, frontend, login, catalog, cart + database/redis/storage) ko
  dobara chalu karta hai.
- **Aapka data (waitlist leads, demand) bilkul nahi chhuta** — database container restart bhi nahi
  hota, sirf app wale hisse naye bante hain.
- Ant me ye line aaye to samajh lo deploy theek hua:
  `gateway UP after ~Ns` aur `== deploy complete ==`.

Lagbhag **1-3 minute** lagta hai.

---

## Step 3 — Verify karo ki site live hai

Server ke andar se (ya `exit` karke apne Mac se — dono chalega):

```bash
# Homepage zinda hai? (200 = haan)
curl -sS -o /dev/null -w 'mallde.in -> HTTP %{http_code}\n' https://mallde.in/
```

`HTTP 200` aaye = site live aur theek hai. Browser me **https://mallde.in** khol ke bhi dekh sakte ho
(padlock 🔒 dikhna chahiye).

---

## Agar kuch galat lage

```bash
# Sab containers chal rahe hain? (sab ke aage "Up" hona chahiye)
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Gateway (site ka darwaza) healthy hai?
curl -ks https://localhost:8443/actuator/health
#   -> {"status":"UP", ...} aana chahiye

# Kisi service ka log dekhna ho (jaise frontend):
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50 frontend
```

- Site khulti nahi / **error 521** dikhe → ye Cloudflare ka port wala issue hai; `deploy/CLOUDFLARE.md`
  dekho (ek "Origin Rule" chahiye hota hai). Confuse ho to Claude ko bolo.
- Kuch bhi ajeeb lage → Step 2 (deploy) ek baar phir chala do; zyada tar issue isse theek ho jata hai.

---

## Demand (waitlist leads) padhni ho?

Wo alag file me hai — **`deploy/DEMAND-ACCESS.md`**. Sabse aasan: apne Mac se

```bash
curl -s "https://mallde.in/api/catalog/notify/count?topic=litchi"
```

(`litchi` ki jagah `mango` / `honey` / `quiz` daal sakte ho.)

---

## ⚠️ Kabhi ye mat karna

- `deploy/03-public-smoke.sh` ko **live mallde.in pe mat chalao** — wo ek nakli (test) signup add kar
  deta hai aur asli demand ke numbers kharab ho jate hain.
- Database ko `down -v` se kabhi band mat karna — usme aapka saara data hai.
