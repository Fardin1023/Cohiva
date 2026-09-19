# Cohiva v10 — Vercel deployment

Cohiva uses a split production architecture:

- **Vercel**: Next.js web app, authenticated API routes, password reset, meeting metadata, attendance, chat, whiteboard state, recording metadata.
- **MongoDB Atlas**: application data.
- **Vercel Private Blob**: host-only recording files.
- **External Linux server/VPS**: Cohiva RTC (`mediasoup`) + Coturn. This remains outside Vercel because the media server needs long-running state and dedicated UDP/TCP media ports.

## A. Prepare the Vercel web project

### 1. Install/update dependencies locally

From the Cohiva project root:

```powershell
npm install
```

This installs `@vercel/blob` and refreshes `package-lock.json`.

### 2. Put the project in Git

Push the project to GitHub/GitLab/Bitbucket, then in Vercel choose **Add New → Project** and import the repository. Framework preset should be **Next.js**. The repository root is the Cohiva folder that contains `package.json` and `vercel.json`.

You can also deploy using the Vercel CLI after `npm install -g vercel`:

```powershell
vercel
```

Do not run the final production deployment until the RTC server and environment variables below are ready.

### 3. Create a PRIVATE Vercel Blob store

In the Vercel project:

1. Open **Storage**.
2. Create a **Blob** store.
3. Choose **Private** access.
4. Connect it to the Cohiva project and production environment.

Cohiva uploads recordings directly from the host browser to Blob using multipart client uploads. The large WebM file therefore does not pass through a Vercel Function. Playback uses short-lived signed GET URLs after Cohiva verifies that the signed-in user owns the recording.

Current Vercel Private Blob deployments can use project OIDC. If your Blob configuration creates `BLOB_READ_WRITE_TOKEN`, keep it only in Vercel environment settings and never commit it.

## B. Configure the external Cohiva RTC server

The Next.js app can be on Vercel, but the mediasoup/Coturn service still needs a small Linux server with a public IPv4 address.

### 1. DNS

Point an RTC hostname to the server, for example:

```text
rtc.example.com -> YOUR_VPS_PUBLIC_IP
```

The web app may use your default Vercel domain, for example `https://cohiva-abc.vercel.app`; it does not need to be on the same server.

### 2. Firewall

Allow inbound:

- TCP 80, 443 — Caddy certificate/HTTPS/WSS
- UDP 443 — optional HTTP/3
- TCP + UDP 4101 — mediasoup media
- TCP + UDP 3478 — TURN
- TCP + UDP 49160–49200 — TURN relay range

Do not expose signaling port 4100 directly. Caddy proxies HTTPS/WSS on port 443 to it.

### 3. RTC environment

On the server, copy:

```bash
cp .env.rtc.example .env.rtc
```

Fill the real values. `COHIVA_RTC_SECRET` must be identical to the value you later put in Vercel. `COHIVA_TURN_SECRET` must be a different random secret.

Generate secrets on Linux with:

```bash
openssl rand -base64 48
```

Set `COHIVA_RTC_ALLOWED_ORIGINS` to the exact Vercel production origin, for example:

```env
COHIVA_RTC_ALLOWED_ORIGINS=https://cohiva-abc.vercel.app
```

Run:

```bash
COHIVA_RTC_PREFLIGHT_ENV=.env.rtc npm run preflight:rtc
```

### 4. Launch RTC + TURN

```bash
docker compose --env-file .env.rtc -f docker-compose.rtc.yml build
docker compose --env-file .env.rtc -f docker-compose.rtc.yml up -d
```

Check:

```bash
docker compose --env-file .env.rtc -f docker-compose.rtc.yml ps
```

Health endpoint:

```text
https://rtc.example.com/health
```

The same HTTPS endpoint also carries authenticated `/internal/*` control calls from the Vercel app. The RTC server rejects those calls unless the bearer secret matches `COHIVA_RTC_SECRET`.

## C. Add Vercel environment variables

Open **Vercel → Cohiva project → Settings → Environment Variables**. Add the values from `.env.production.example` to **Production**.

Required application values:

```env
MONGODB_URI=...
COHIVA_APP_URL=https://your-production-vercel-domain.vercel.app
COHIVA_RTC_SECRET=...
COHIVA_RTC_PUBLIC_URL=wss://rtc.example.com/rtc
COHIVA_RTC_INTERNAL_URL=https://rtc.example.com
COHIVA_RECORDING_STORAGE=vercel-blob
NEXT_PUBLIC_COHIVA_RECORDING_STORAGE=vercel-blob
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Cohiva <no-reply@example.com>"
```

Do **not** put the following RTC-only secrets/settings in the public client environment:

```text
COHIVA_TURN_SECRET
COHIVA_PUBLIC_IP
COHIVA_RTC_ANNOUNCED_ADDRESS
```

TURN credentials are generated on the RTC server and sent as time-limited ICE credentials when a participant joins.

## D. MongoDB Atlas

Use a production Atlas database and a dedicated database user. Permit connections from Vercel and the RTC server. If you temporarily use `0.0.0.0/0` during setup, use a strong database password and reduce network exposure later if your architecture permits it.

Use the same `MONGODB_URI` in Vercel and `.env.rtc`.

## E. Password reset SMTP

Production password reset never exposes the development reset link. Configure a real SMTP provider in Vercel and verify the sender address/domain required by that provider.

`COHIVA_APP_URL` determines the reset-link origin. If it is omitted on Vercel, Cohiva can fall back to Vercel's production project URL, but explicitly setting it is recommended.

## F. Pre-deployment checks

Locally, after creating a temporary `.env.production` containing the same non-Blob values you will enter into Vercel:

```powershell
$env:COHIVA_PREFLIGHT_ENV=".env.production"
npm run preflight:vercel
npm run typecheck
npm run lint
npm run build
```

Or run all four through:

```powershell
$env:COHIVA_PREFLIGHT_ENV=".env.production"
npm run deploy:check:vercel
```

Delete the local `.env.production` afterwards if you do not need it. It is gitignored.

## G. Deploy to Vercel

If the project is linked to Git, push the final commit and let Vercel deploy it. Or use:

```powershell
vercel --prod
```

After deployment, confirm:

```text
https://YOUR-VERCEL-DOMAIN/api/health
https://YOUR-RTC-DOMAIN/health
```

The app health response should report MongoDB healthy and `recordingStorage: "vercel-blob"`.

## H. Final launch test

Use two separate accounts and preferably two separate networks. Verify:

- register, sign in, sign out, forgot/reset password
- create/schedule meeting
- open/approval/locked access and waiting room
- camera, microphone, screen share
- chat and reactions
- whiteboard late-open synchronization
- host permissions/moderation
- attendance timing + CSV export
- host-only recording start/stop
- recording appears in Recordings
- playback follows the authenticated signed URL
- download works
- delete removes both Blob object and MongoDB record
- participant cannot access host recording URL/API
- refresh/reconnect
- End for Everyone and meeting duration expiry
- old ended links rejected
- ended meetings remain absent from Previous Meetings

## I. Important production notes

- The old `docker-compose.production.yml` is the previous all-in-one VPS layout. **Do not use it for the Vercel web deployment.** Use `docker-compose.rtc.yml` only on the RTC server.
- The local filesystem recording mode is preserved for local development, but Vercel production must use `COHIVA_RECORDING_STORAGE=vercel-blob` and `NEXT_PUBLIC_COHIVA_RECORDING_STORAGE=vercel-blob`.
- Auth rate limiting is MongoDB-backed in v10 so it works across multiple Vercel Function instances; there is a process-local fallback only if the rate-limit database operation temporarily fails.
- Keep `.env.local`, `.env.production`, `.env.rtc`, SMTP secrets, MongoDB credentials, Blob credentials, RTC secret, and TURN secret out of Git.
