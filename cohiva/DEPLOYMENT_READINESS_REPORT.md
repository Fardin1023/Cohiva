# Cohiva v10 Vercel deployment-readiness report

Baseline: Cohiva v8.2 plus the production/security work from v9, converted for a split Vercel + external RTC deployment.

## Target architecture

- **Vercel:** Next.js application and authenticated HTTP APIs.
- **MongoDB Atlas:** users, sessions, meetings, attendance, whiteboard state, recording metadata, and distributed rate-limit buckets.
- **Vercel Private Blob:** host-only WebM recording files.
- **External Linux VPS/server:** Cohiva RTC (mediasoup + WebSocket signaling), Coturn, and Caddy HTTPS/WSS termination.

## Vercel-specific work completed

- Added `@vercel/blob` 2.4+ integration and `vercel.json`.
- Converted production recording uploads to browser -> Vercel Private Blob client uploads, so large WebM files do not pass through a Vercel Function body.
- Uses multipart direct uploads for large recordings.
- Blob upload tokens are issued only after Cohiva authenticates the caller and verifies that the caller is the meeting host.
- Added a recording finalization endpoint that verifies the uploaded Blob and stores metadata in MongoDB.
- Blob completion callback provides a fallback if the browser disappears after the upload completes but before finalization.
- Callback/finalize races are idempotent; a duplicate-key race is treated as success.
- Host playback uses short-lived signed GET URLs, allowing the browser to stream/seek directly from private Blob storage rather than proxying video through a Vercel Function.
- Host delete removes both the private Blob object and MongoDB metadata.
- Local filesystem recording remains available for local/non-Vercel development.
- Added Vercel-aware health reporting and password-reset production URL fallback.
- Replaced process-memory-only auth rate limiting with MongoDB-backed buckets suitable for multiple Vercel Function instances, retaining a local fallback if the database limiter is unavailable.
- Added `.env.production.example` for Vercel and `.env.rtc.example` for the external RTC/TURN host.
- Added `scripts/vercel-preflight.mjs` and `scripts/rtc-preflight.mjs`.
- Added `docker-compose.rtc.yml` plus an RTC-only Caddy configuration for the external server.
- RTC `/internal/*` control endpoints are reachable over HTTPS for the Vercel server, but remain protected by the shared `COHIVA_RTC_SECRET` Bearer credential.
- Existing HTTPS/WSS validation, same-origin mutation protection, secure cookies, WebSocket origin allow-list, TURN REST credentials, SMTP hardening, meeting lifecycle protection, and host-only authorization are preserved.

## Security/storage notes

- Production Vercel recording storage must be a **Private** Vercel Blob store.
- The browser never receives the store-wide write credential. Client uploads use scoped upload authorization after Cohiva host authentication.
- Recording playback URLs are scoped, expiring signed URLs and are only minted after host ownership is verified.
- `COHIVA_RTC_SECRET` and `COHIVA_TURN_SECRET` must be independent strong secrets.
- Real `.env.production`, `.env.rtc`, `.env.local`, Blob credentials, SMTP credentials, MongoDB credentials, and RTC/TURN secrets must never be committed.

## Automated checks performed for v10

- 125 TypeScript/TSX/MTS/CTS source files parsed/transpiled with zero syntax diagnostics.
- `package.json`, `package-lock.json`, and `vercel.json` parsed successfully as JSON.
- `docker-compose.rtc.yml` and the retained legacy `docker-compose.production.yml` parsed successfully as YAML.
- `scripts/vercel-preflight.mjs` and `scripts/rtc-preflight.mjs` passed with synthetic valid environments.
- Source scan found no committed `.env.local`, `.env.production`, `.env.rtc`, PEM/key files, or embedded real application credentials.
- Remaining Stream names occur only in preflight warnings that tell the owner to remove obsolete Stream environment variables.

A full dependency-resolved `npm install` / `npm run typecheck` / `npm run lint` / `npm run build` cannot be completed in the artifact environment because registry access is unavailable in this artifact environment. A package-lock refresh attempt failed with `EAI_AGAIN` while npm tried to reach `registry.npmjs.org`; the newly added `@vercel/blob` dependency therefore cannot be resolved here. On a normal internet-connected machine, run:

```bash
npm install
npm run deploy:check:vercel
```

`npm install` will also refresh `package-lock.json` with the new Blob dependency before you commit/deploy.

## External values still required

The owner must supply these real values; source code cannot safely invent them:

- MongoDB Atlas URI and database user credentials
- final Vercel production URL or custom Cohiva web domain
- external RTC hostname and public IPv4 address
- RTC shared secret
- TURN shared secret
- SMTP server/account details for production password reset
- DNS for the RTC hostname

## Final real-world validation still required

Run `FINAL_TEST_CHECKLIST.md` after both Vercel and the RTC/TURN server are online. Cross-network WebRTC/TURN, browser media permissions, real SMTP delivery, Private Blob upload/playback/download/delete, and responsive behavior require real infrastructure and browsers and cannot be proven by a source-only check.
