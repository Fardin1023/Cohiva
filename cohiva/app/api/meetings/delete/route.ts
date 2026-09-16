import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import CohivaRtcRoom from "@/models/CohivaRtcRoom";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const body = await request.json();
    const callIds = Array.isArray(body.callIds)
      ? body.callIds.filter((value: unknown) => typeof value === "string").slice(0, 100)
      : [];
    if (!callIds.length) return Response.json({ success: true, count: 0 });
    await connectMongoDB();
    const result = await CohivaRtcRoom.updateMany(
      {
        callId: { $in: callIds },
        $or: [{ hostUserId: userId }, { memberUserIds: userId }],
      },
      { $addToSet: { hiddenForUserIds: userId } }
    );
    return Response.json({ success: true, count: result.modifiedCount });
  } catch (error) {
    console.error("Hide Cohiva meeting history error:", error);
    return Response.json({ error: "Unable to clear meeting history." }, { status: 500 });
  }
}
