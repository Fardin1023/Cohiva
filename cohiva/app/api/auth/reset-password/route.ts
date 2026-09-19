import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/auth/password";
import {
  hashPasswordResetToken,
  passwordLooksValid,
} from "@/lib/auth/passwordReset";
import connectMongoDB from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/security/rateLimit";
import AuthSession from "@/models/AuthSession";
import CohivaUser from "@/models/CohivaUser";
import PasswordResetToken from "@/models/PasswordResetToken";

export async function POST(request: Request) {
  const rate = await checkRateLimit(request, "auth:reset-password", {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many reset attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!token || token.length > 256) {
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    if (!passwordLooksValid(password)) {
      return NextResponse.json(
        {
          error:
            "Password must be 8-128 characters and include at least one letter and one number.",
        },
        { status: 400 }
      );
    }

    await connectMongoDB();

    const tokenHash = hashPasswordResetToken(token);
    const rawReset = await PasswordResetToken.findOneAndDelete({
      tokenHash,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!rawReset) {
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const reset = rawReset as unknown as { userId: { toString(): string } };
    const userId = reset.userId.toString();
    const passwordHash = await hashPassword(password);

    const updated = await CohivaUser.findByIdAndUpdate(
      userId,
      { $set: { passwordHash } },
      { new: false }
    );

    if (!updated) {
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    await Promise.all([
      PasswordResetToken.deleteMany({ userId }),
      AuthSession.deleteMany({ userId }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Cohiva reset-password error:", error);
    return NextResponse.json(
      { error: "Unable to reset your password right now." },
      { status: 500 }
    );
  }
}
