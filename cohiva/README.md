# Cohiva

Cohiva is a classroom/meeting application built with Next.js, MongoDB, mediasoup, WebSockets, Excalidraw, custom authentication, host-only recording, attendance, waiting-room controls, and realtime collaboration.

## Local development

1. Copy `.env.example` to `.env.local` and fill the required values.
2. Install dependencies:

```bash
npm install
```

3. Start the RTC server:

```bash
npm run rtc
```

4. In a second terminal, start Next.js:

```bash
npm run dev
```

## Recommended production architecture

Cohiva's web application is prepared for **Vercel**. The media server remains a separate long-running service because mediasoup/Coturn need dedicated networking and UDP/TCP media ports.

- **Vercel:** Next.js web app, auth/API routes, private recording access
- **Vercel Private Blob:** meeting recording files
- **MongoDB Atlas:** persistent application data
- **External Linux VPS:** Cohiva RTC/mediasoup + Coturn + Caddy TLS

See [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md), `.env.production.example`, and `.env.rtc.example` before deploying.

Useful checks:

```bash
npm run preflight:vercel
npm run typecheck
npm run lint
npm run build
```

For the external RTC host:

```bash
npm run preflight:rtc
```

The older all-in-one Docker/VPS deployment is retained in [`DEPLOYMENT.md`](./DEPLOYMENT.md) for reference, but it is not the recommended path when the web app is deployed on Vercel.
