import { createHmac, timingSafeEqual } from "node:crypto";

export type RtcRole = "host" | "participant";

export type RtcTokenPayload = {
  callId: string;
  userId: string;
  name: string;
  image: string;
  role: RtcRole;
  exp: number;
  maxParticipants: number;
  durationMinutes: number;
  custom: Record<string, unknown>;
};

const encode = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");

const signPart = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64url");

export const createRtcToken = (
  payload: RtcTokenPayload,
  secret: string
) => {
  const body = encode(JSON.stringify(payload));
  const signature = signPart(body, secret);
  return `${body}.${signature}`;
};

export const verifyRtcToken = (
  token: string,
  secret: string
): RtcTokenPayload => {
  const [body, signature] = token.split(".");

  if (!body || !signature) {
    throw new Error("Invalid RTC token.");
  }

  const expected = signPart(body, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid RTC token signature.");
  }

  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  ) as RtcTokenPayload;

  if (!payload.exp || payload.exp <= Date.now()) {
    throw new Error("RTC token expired.");
  }

  if (!payload.callId || !payload.userId) {
    throw new Error("Invalid RTC token payload.");
  }

  return payload;
};
