# quick-ecommerce

A small full-stack ecommerce demo: **Spring Boot** REST API + **React + Vite** storefront.
In-memory data (no database) so it runs with zero setup.

## Stack
- **Backend:** Java 17, Spring Boot 3, Maven — `backend/`
- **Frontend:** React 18 + TypeScript + Vite — `frontend/`

## Run it

**Backend** (port 8080):
```bash
cd backend
mvn spring-boot:run
```

**Frontend** (port 5173, proxies `/api` → 8080):
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

## API contract

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/api/products` | — | `[Product]` |
| GET | `/api/products/{id}` | — | `Product` |
| GET | `/api/cart` | — | `Cart` |
| POST | `/api/cart` | `{ productId, quantity }` | `Cart` (quantity is a **signed delta**: `+1` add, `-1` decrement; a line at ≤0 is removed) |
| DELETE | `/api/cart/{productId}` | — | `Cart` |
| POST | `/api/orders` | — | `Order` (and clears cart) |

**Product** `{ id: number, name: string, description: string, price: number, imageUrl: string, category: string }`
**Cart** `{ items: [{ product: Product, quantity: number }], total: number }`
**Order** `{ orderId: string, items: [CartItem], total: number, placedAt: string }`

> Cart is a single in-memory session (demo scope — no auth/users).

## Project structure
```
backend/   Spring Boot API (products, cart, orders) — in-memory
frontend/  React+Vite storefront (grid, cart drawer, checkout)
```
