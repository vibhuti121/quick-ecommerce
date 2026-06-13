# Multi-stage: build the Vite SPA, then serve the static bundle from nginx.
# Unlike admin-app, the storefront is PUBLIC and stateless — no basic-auth, no API proxy.
# The gateway owns /api,/auth routing; the browser loads the SPA and calls the API from the
# SAME origin (https://localhost:8443/), so VITE_API_BASE stays empty and CORS never engages.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Taste Match V7 Google Sign-In: Vite inlines import.meta.env.VITE_* at BUILD time, so the client id
# must be present here (a runtime container env is too late). Passed as a build ARG from compose
# (root .env). Empty default => GOOGLE_ENABLED=false => one-tap hidden, password fallback only.
# The Google client id is PUBLIC by design (it ships in the browser bundle); it is not a secret.
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
# `npm run build` is `tsc && vite build` — strict TS compile is part of the gate.
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
