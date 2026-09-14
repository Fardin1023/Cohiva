import { NextResponse } from "next/server";

import {
  createAuthSession,
  deleteCurrentAuthSession,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import connectMongoDB from "@/lib/mongodb";
import CohivaUser from "@/models/CohivaUser";

const normalizeEmail = (
  value: unknown
) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .slice(0, 320);
};

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const email =
      normalizeEmail(body.email);

    const password =
      typeof body.password ===
      "string"
        ? body.password
        : "";

    if (
      !email ||
      !password ||
      password.length > 128
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid email or password.",
        },
        {
          status: 401,
        }
      );
    }

    await connectMongoDB();

    const rawUser =
      await CohivaUser.findOne({
        email,
      })
        .select(
          "+passwordHash"
        )
        .lean();

    if (!rawUser) {
      return NextResponse.json(
        {
          error:
            "Invalid email or password.",
        },
        {
          status: 401,
        }
      );
    }

    const user =
      rawUser as unknown as {
        _id: {
          toString(): string;
        };
        passwordHash: string;
      };

    const valid =
      await verifyPassword(
        password,
        user.passwordHash
      );

    if (!valid) {
      return NextResponse.json(
        {
          error:
            "Invalid email or password.",
        },
        {
          status: 401,
        }
      );
    }

    await deleteCurrentAuthSession();
    await createAuthSession(
      user._id.toString()
    );

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "Cohiva login error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to sign in right now.",
      },
      {
        status: 500,
      }
    );
  }
}
