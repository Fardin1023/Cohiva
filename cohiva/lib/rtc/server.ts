const getConfig = () => {
  const baseUrl =
    process.env.COHIVA_RTC_INTERNAL_URL?.trim() ||
    `http://127.0.0.1:${process.env.COHIVA_RTC_PORT || "4100"}`;

  const secret = process.env.COHIVA_RTC_SECRET?.trim() || "";

  if (!secret) {
    throw new Error("COHIVA_RTC_SECRET is required for RTC server actions.");
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    secret,
  };
};

const rtcFetch = async (
  path: string,
  init: RequestInit = {}
) => {
  const { baseUrl, secret } = getConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      body?.error || `Cohiva RTC server request failed (${response.status}).`
    );
  }

  return body;
};

export const broadcastRtcEvent = async ({
  callId,
  event,
  data,
  targetUserId,
}: {
  callId: string;
  event: string;
  data?: Record<string, unknown>;
  targetUserId?: string;
}) =>
  rtcFetch("/internal/broadcast", {
    method: "POST",
    body: JSON.stringify({
      callId,
      event,
      data: data ?? {},
      ...(targetUserId ? { targetUserId } : {}),
    }),
  });

export const getRtcRoomStats = async (callId: string) =>
  rtcFetch(`/internal/stats?callId=${encodeURIComponent(callId)}`);

export const endRtcMeeting = async (callId: string) =>
  rtcFetch("/internal/end", {
    method: "POST",
    body: JSON.stringify({ callId }),
  });
