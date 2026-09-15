import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/server";
import {
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
  COHIVA_CALL_TYPE,
} from "@/lib/cohivaMeetingConfig";
import connectMongoDB from "@/lib/mongodb";
import { createRtcToken } from "@/lib/rtc/token";
import { getStreamServerClient } from "@/lib/streamServer";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

const normalizeWsUrl = (raw: string) => {
  const value =
    raw.trim() || "ws://127.0.0.1:4100/rtc";

  try {
    const url = new URL(value);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/rtc";
    }
    return url.toString();
  } catch {
    return "ws://127.0.0.1:4100/rtc";
  }
};

const getMeetingMetadata = async (callId: string) => {
  const streamClient = getStreamServerClient();
  const call = streamClient.video.call(
    COHIVA_CALL_TYPE,
    callId
  );

  const response = await call.get();
  const callData = response.call;

  const hostUserId = callData.created_by?.id?.trim();

  if (!hostUserId) {
    throw new Error(
      "This meeting does not have a valid host."
    );
  }

  const limits = callData.settings?.limits;

  const durationMinutes =
    clampMeetingDurationMinutes(
      Math.round(
        Number(
          limits?.max_duration_seconds ?? 2700
        ) / 60
      )
    );

  const maxParticipants =
    clampMeetingParticipants(
      limits?.max_participants ?? 20
    );

  const custom =
    (callData.custom ?? {}) as Record<
      string,
      unknown
    >;

  const endedAt =
    (callData as unknown as {
      ended_at?: string | Date | null;
    }).ended_at ?? null;

  return {
    hostUserId,
    durationMinutes,
    maxParticipants,
    custom,
    endedAt,
  };
};

const ensureRtcRoom = async (
  callId: string,
  hostUserId: string
) => {
  await connectMongoDB();

  return CohivaRtcRoom.findOneAndUpdate(
    { callId },
    {
      $set: {
        hostUserId,
      },
      $setOnInsert: {
        callId,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
};

export async function POST(request: Request) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const secret =
    process.env.COHIVA_RTC_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      { error: "Cohiva RTC is not configured." },
      { status: 500 }
    );
  }

  let body: { callId?: string } = {};

  try {
    body = (await request.json()) as {
      callId?: string;
    };
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  const callId = body.callId?.trim();

  if (
    !callId ||
    !/^[A-Za-z0-9_-]{3,120}$/.test(callId)
  ) {
    return NextResponse.json(
      {
        error:
          "Use a room id containing only letters, numbers, - or _.",
      },
      { status: 400 }
    );
  }

  const name =
    user.fullName?.trim() ||
    user.username?.trim() ||
    user.email.split("@")[0] ||
    "Cohiva user";

  /*
   * RTC tokens are placed in the WebSocket URL. Do not
   * embed a large uploaded data-URI avatar there. HTTP(S)
   * profile images remain safe to include.
   */
  const image = user.imageUrl
    ? `/api/auth/avatar/${encodeURIComponent(user.id)}`
    : "";

  try {
    const metadata = await getMeetingMetadata(callId);

    if (metadata.endedAt) {
      return NextResponse.json(
        { error: "This meeting has already ended." },
        { status: 410 }
      );
    }

    await ensureRtcRoom(
      callId,
      metadata.hostUserId
    );

    const role =
      metadata.hostUserId === user.id
        ? "host"
        : "participant";

    const token = createRtcToken(
      {
        callId,
        userId: user.id,
        name,
        image,
        avatarIcon: user.avatarIcon || "",
        role,
        exp: Date.now() + 10 * 60_000,
        maxParticipants:
          metadata.maxParticipants,
        durationMinutes:
          metadata.durationMinutes,
        custom: metadata.custom,
      },
      secret
    );

    const wsUrl = normalizeWsUrl(
      process.env.NEXT_PUBLIC_COHIVA_RTC_URL ||
        "ws://127.0.0.1:4100/rtc"
    );

    return NextResponse.json({
      token,
      wsUrl,
      callId,
      userId: user.id,
      name,
      role,
      hostUserId: metadata.hostUserId,
      durationMinutes: metadata.durationMinutes,
      maxParticipants: metadata.maxParticipants,
    });
  } catch (tokenError) {
    console.error(
      "Cohiva RTC token error:",
      tokenError
    );

    return NextResponse.json(
      {
        error:
          "Unable to prepare this Cohiva RTC meeting.",
      },
      { status: 500 }
    );
  }
}
