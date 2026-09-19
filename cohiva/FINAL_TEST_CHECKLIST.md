# Cohiva final pre-launch test checklist

Run this after the production stack is online. Use at least two accounts, two browsers, and for the network test use two different networks when possible.

## Authentication and account

- [ ] New account can register.
- [ ] Existing account can sign in.
- [ ] Password show/hide works on sign-in, sign-up, and reset forms.
- [ ] Sign out invalidates the session; browser Back does not reopen the dashboard.
- [ ] Forgot-password email arrives from the configured SMTP sender.
- [ ] Reset link works once and expires/invalidates after use.
- [ ] Old sessions are invalidated after password reset.
- [ ] Rate-limited auth endpoints return a friendly 429 after repeated abuse attempts.

## Meeting creation and lifecycle

- [ ] Host can create an instant meeting.
- [ ] Host can create a scheduled meeting.
- [ ] Scheduled meeting remains usable when host starts late.
- [ ] Meeting timer starts when host actually starts the RTC session.
- [ ] Refresh/reconnect does not reset the timer.
- [ ] Host can leave temporarily and rejoin.
- [ ] Participant can refresh/reconnect after admission.
- [ ] End for Everyone closes all active clients.
- [ ] Expired meetings close automatically.
- [ ] Old ended links are rejected.
- [ ] Ended meetings disappear from Upcoming.
- [ ] Ended meetings are NOT added to Previous Meetings.

## Access / waiting room

- [ ] Open mode admits users correctly.
- [ ] Approval mode shows requests to host.
- [ ] Approve grants access and survives refresh.
- [ ] Deny removes the request/member correctly.
- [ ] Locked mode blocks newcomers but admitted users can reconnect.
- [ ] Participant limit is enforced.
- [ ] Waiting-room polling stops quietly when a meeting ends.

## RTC media

- [ ] Host camera on/off.
- [ ] Host microphone on/off.
- [ ] Student camera on/off when permitted.
- [ ] Student microphone on/off when permitted.
- [ ] Screen sharing works and stops cleanly.
- [ ] Host can disable student mic/camera/screen share.
- [ ] Removed/blocked participant cannot continue publishing.
- [ ] Audio/video works between two different networks.
- [ ] Force `COHIVA_RTC_ICE_TRANSPORT_POLICY=relay`, redeploy RTC, and verify TURN-only media once; then return it to `all`.

## Chat / reactions

- [ ] Chat sends/receives in real time.
- [ ] Chat survives temporary realtime interruption via persistence.
- [ ] Reactions and raise-hand events appear correctly.
- [ ] Unauthorized/non-admitted users cannot call meeting realtime APIs.

## Whiteboard

- [ ] Teacher can draw/edit/clear.
- [ ] Student view-only mode is enforced.
- [ ] Student opening the board late receives the complete existing drawing.
- [ ] New strokes continue appearing live.
- [ ] Close/reopen/reconnect restores the current board.
- [ ] Whiteboard persistence PUT returns 200; no autosave 500 errors.

## Attendance

- [ ] Join/leave times are correct.
- [ ] Live duration increases while participant is present.
- [ ] Rejoin increments join count without losing previous duration.
- [ ] End for Everyone finalizes open attendance sessions.
- [ ] Host can export CSV.
- [ ] Non-host cannot export attendance.

## Recording

- [ ] Only host sees/uses recording controls.
- [ ] Student cannot invoke recording APIs manually.
- [ ] Recording indicator appears while active.
- [ ] Saved recording contains expected meeting audio/video/screen share.
- [ ] Recording appears on Dashboard -> Recordings.
- [ ] Playback works with range requests/seeking.
- [ ] Download works.
- [ ] Delete removes metadata and file.
- [ ] A recording larger than 4.5 MB uploads successfully without passing the video body through a Vercel Function.
- [ ] Private Blob URL is not directly usable without Cohiva-authorized signed access.
- [ ] Recording remains available after a new Vercel deployment because the media file is stored in Vercel Private Blob, not the Function filesystem.

## Browser / responsive

- [ ] Chrome desktop.
- [ ] Edge desktop.
- [ ] Android/iOS browser layout at common phone width.
- [ ] Tablet layout.
- [ ] No horizontal overflow or inaccessible controls.
- [ ] Camera/microphone/screen-share permission-denied states are understandable.

## Production/security

- [ ] `https://<app>/api/health` returns OK.
- [ ] `https://<rtc>/health` returns OK.
- [ ] HTTP redirects to HTTPS.
- [ ] `wss://` RTC signaling works.
- [ ] An unauthenticated request to the public RTC `/internal/*` endpoints is rejected; Vercel server-to-server requests with the correct RTC Bearer secret succeed.
- [ ] Vercel Production environment variables are configured from `.env.production.example`; no real `.env.production` is committed.
- [ ] External RTC host uses a private `.env.rtc`; no real `.env.rtc` is committed.
- [ ] Old Stream keys are absent.
- [ ] RTC and TURN secrets are different strong random values.
- [ ] MongoDB allows connections only as intended and uses a dedicated database user.
- [ ] Firewall exposes only the documented ports.
- [ ] MongoDB backup/restore and Vercel Blob retention/recovery expectations are documented and understood.
