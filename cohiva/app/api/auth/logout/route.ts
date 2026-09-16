import { NextResponse } from "next/server";

import { deleteCurrentAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await deleteCurrentAuthSession();

    return NextResponse.json(
      {
        ok: true,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, max-age=0, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error(
      "Cohiva logout error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to sign out right now.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, max-age=0, must-revalidate",
        },
      }
    );
  }
}
