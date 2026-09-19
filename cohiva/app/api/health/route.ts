import { access } from "node:fs/promises";
import { constants } from "node:fs";

import connectMongoDB from "@/lib/mongodb";
import { usesVercelBlobRecordings } from "@/lib/recordings/backend";
import { ensureRecordingsDirectory } from "@/lib/recordings/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mongoose = await connectMongoDB();
    if (!mongoose.connection.db) {
      throw new Error("MongoDB connection is not ready.");
    }
    await mongoose.connection.db.admin().ping();

    const blobStorage = usesVercelBlobRecordings();
    if (!blobStorage) {
      const recordingDirectory = await ensureRecordingsDirectory();
      await access(recordingDirectory, constants.W_OK);
    }

    return Response.json(
      {
        ok: true,
        services: {
          database: "ok",
          recordingStorage: blobStorage ? "vercel-blob" : "filesystem",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Cohiva health check failed:", error);
    return Response.json(
      {
        ok: false,
        services: {
          database: "unavailable",
          recordingStorage: "unavailable",
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
