import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import MeetingRecording from "@/models/MeetingRecording";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    await connectMongoDB();

    const recordings = await MeetingRecording.find({ hostUserId: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return Response.json({
      success: true,
      recordings: recordings.map((recording) => ({
        id: recording.recordingId,
        callId: recording.callId,
        title: recording.title || "Cohiva Meeting",
        mimeType: recording.mimeType || "video/webm",
        sizeBytes: recording.sizeBytes || 0,
        durationMs: recording.durationMs || 0,
        createdAt: recording.createdAt,
      })),
    });
  } catch (error) {
    console.error("List Cohiva recordings error:", error);
    return Response.json(
      { error: "Cohiva could not load your recordings." },
      { status: 500 }
    );
  }
}
