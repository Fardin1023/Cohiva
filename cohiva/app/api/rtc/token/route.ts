import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import { createRtcToken } from "@/lib/rtc/token";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

const normalizeWsUrl = (raw: string) => {
  const value = raw.trim() || "ws://127.0.0.1:4100/rtc";
  try {
    const url = new URL(value);
    if (!url.pathname || url.pathname === "/") url.pathname = "/rtc";
    return url.toString();
  } catch {
    return "ws://127.0.0.1:4100/rtc";
  }
};

const getOrCreateRtcRoom = async (callId: string, userId: string) => {
  await connectMongoDB();

  let room = await CohivaRtcRoom.findOne({ callId }).lean();
  if (room) return room;

  try {
    const created = await CohivaRtcRoom.create({ callId, hostUserId: userId });
    return created.toObject();
  } catch (error: any) {
    // If two users request the same room at nearly the same time, the unique
    // callId index decides who created it. Re-read instead of failing signup/join.
    if (error?.code === 11000) {
      room = await CohivaRtcRoom.findOne({ callId }).lean();
      if (room) return room;
    }
    throw error;
  }
};

export async function POST(request: Request) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.COHIVA_RTC_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Cohiva RTC is not configured." },
      { status: 500 }
    );
  }

  let body: { callId?: string } = {};
  try {
    body = (await request.json()) as { callId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const callId = body.callId?.trim();
  if (!callId || !/^[A-Za-z0-9_-]{3,120}$/.test(callId)) {
    return NextResponse.json(
      { error: "Use a room id containing only letters, numbers, - or _." },
      { status: 400 }
    );
  }

  const name =
    user.fullName?.trim() ||
    user.username?.trim() ||
    user.email.split("@")[0] ||
    "Cohiva user";

  // Do not place large uploaded data-URI avatars inside an RTC URL token.
  const image = /^https?:\/\//i.test(user.imageUrl || "")
    ? user.imageUrl.slice(0, 2048)
    : "";

  try {
    const room = await getOrCreateRtcRoom(callId, user.id);
    const role = room.hostUserId === user.id ? "host" : "participant";

    const token = createRtcToken(
      {
        callId,
        userId: user.id,
        name,
        image,
        role,
        exp: Date.now() + 10 * 60_000,
        maxParticipants: 20,
        durationMinutes: 45,
        custom: {},
      },
      secret
    );

    const wsUrl = normalizeWsUrl(
      process.env.NEXT_PUBLIC_COHIVA_RTC_URL || "ws://127.0.0.1:4100/rtc"
    );

    return NextResponse.json({
      token,
      wsUrl,
      callId,
      userId: user.id,
      name,
      role,
      hostUserId: room.hostUserId,
    });
  } catch (error) {
    console.error("Cohiva RTC token error:", error);
    return NextResponse.json(
      { error: "Unable to prepare this Cohiva RTC room." },
      { status: 500 }
    );
  }
}
