import { NextResponse } from "next/server";

import { deleteCurrentAuthSession } from "@/lib/auth/session";

export async function POST() {
  try {
    await deleteCurrentAuthSession();

    return NextResponse.json({
      ok: true,
    });
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
      }
    );
  }
}
