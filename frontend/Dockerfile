# Multi-stage: build the Vite SPA, then serve the static bundle from nginx.
# Unlike admin-app, the storefront is PUBLIC and stateless — no basic-auth, no API proxy.
# The gateway owns /api,/auth routing; the browser loads the SPA and calls the API from the
# SAME origin (https://localhost:8443/), so VITE_API_BASE stays empty and CORS never engages.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# `npm run build` is `tsc && vite build` — strict TS compile is part of the gate.
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
