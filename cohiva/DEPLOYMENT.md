> **Vercel deployment:** Cohiva v10 uses Vercel for the Next.js web app and a separate RTC/TURN server. Use [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md). The instructions below describe the older all-in-one VPS layout and are retained only as a fallback reference.

# Cohiva production deployment

This production layout keeps the Next.js app, Cohiva RTC/mediasoup, Coturn, HTTPS proxy, and persistent recordings on one Linux VPS. MongoDB can remain on MongoDB Atlas or another managed MongoDB service.

## 1. VPS and DNS

Use a Linux VPS with a public IPv4 address. For a small initial deployment, 4 vCPU and 8 GB RAM is a practical starting point; actual capacity depends heavily on simultaneous video participants and bitrate.

Create two DNS A records pointing to the VPS public IPv4 address:

- `cohiva.example.com` -> VPS IP
- `rtc.cohiva.example.com` -> VPS IP

The RTC hostname is used for secure WebSocket signaling and TURN on port 3478. Mediasoup media itself uses the VPS public IP and port 4101.

## 2. Firewall

Allow inbound traffic to the VPS on:

- TCP 80 and 443 (Caddy / HTTPS)
- UDP 443 (HTTP/3, optional but used by Caddy)
- TCP + UDP 4101 (mediasoup media)
- TCP + UDP 3478 (TURN)
- TCP + UDP 49160-49200 (TURN relay range)

Do not expose the Next.js port 3000 or RTC signaling port 4100 directly to the internet. Docker exposes those only on the private Compose network; Caddy is the public entry point.

## 3. Production environment

Copy the example and edit it on the server:

```bash
cp .env.production.example .env.production
```

Generate independent random values for `COHIVA_RTC_SECRET` and `COHIVA_TURN_SECRET`. Example on Linux:

```bash
openssl rand -base64 48
```

Set the real MongoDB URI and SMTP credentials. `COHIVA_RECORDINGS_DIR=/data/recordings` is intentionally backed by a Docker named volume so recordings survive container recreation and application redeploys.

Run the preflight before starting production:

```bash
COHIVA_PREFLIGHT_ENV=.env.production npm run preflight:prod
```

## 4. Build and launch

Install Docker Engine and the Docker Compose plugin, then run:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

Check status:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Follow logs:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=200
```

Caddy obtains and renews HTTPS certificates automatically after the DNS records resolve to the VPS and ports 80/443 are reachable.

## 5. Health checks

Application health:

```text
https://cohiva.example.com/api/health
```

RTC health:

```text
https://rtc.cohiva.example.com/health
```

The public RTC proxy intentionally blocks `/internal/*`; internal broadcast/end operations remain reachable only from the private Docker network and additionally require the RTC bearer secret.

## 6. Password reset

Production password reset never returns the development reset URL. `COHIVA_APP_URL` must be HTTPS and SMTP must be configured. Test password reset with a real mailbox before launch.

## 7. Recording persistence and backup

The Compose stack stores recording files in the Docker volume `recordings_data`. Back this volume up. Recording metadata lives in MongoDB, so a usable backup strategy must include both MongoDB and the recording volume.

Example volume backup (adjust project/volume names as needed):

```bash
docker run --rm -v cohiva_recordings_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/cohiva-recordings-$(date +%F).tar.gz -C /data .
```

## 8. TURN

Coturn runs on port 3478 and a restricted relay range. Cohiva uses Coturn's TURN REST authentication: the RTC server generates time-limited username/password credentials from `COHIVA_TURN_SECRET` and injects them into mediasoup-client transport options. The shared TURN secret itself is never sent to the browser. Leave `COHIVA_RTC_ICE_TRANSPORT_POLICY=all` for normal production use: browsers prefer direct mediasoup connectivity and use TURN when necessary. Set `relay` only for diagnostic testing when you specifically want to force TURN.

## 9. Deploying an update

```bash
git pull
COHIVA_PREFLIGHT_ENV=.env.production npm run preflight:prod
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

The `recordings_data` and Caddy certificate volumes are not destroyed by this update.

## 10. Final launch test

Before public release, test with two separate accounts and preferably two separate networks (for example Wi-Fi and mobile data):

- register / sign in / sign out
- forgot password and reset email
- create and schedule meetings
- waiting-room approve/deny/lock/open behavior
- host/student refresh and reconnect
- camera, microphone, screen sharing
- chat and reactions
- whiteboard pre-existing state plus live updates
- host permissions/moderation
- attendance timing and CSV export
- host-only recording, playback, download, delete
- meeting duration expiry and End for Everyone
- old ended links rejected
- ended meetings not shown under Previous Meetings

Also verify mobile/tablet layout and Chrome/Edge behavior before launch.
