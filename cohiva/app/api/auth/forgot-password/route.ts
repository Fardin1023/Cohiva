import { NextResponse } from "next/server";

import {
  createPasswordResetToken,
  emailLooksValid,
  getPasswordResetExpiry,
  hashPasswordResetToken,
  normalizeAuthEmail,
} from "@/lib/auth/passwordReset";
import {
  passwordResetEmailConfigured,
  sendPasswordResetEmail,
} from "@/lib/auth/passwordResetMailer";
import connectMongoDB from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/security/rateLimit";
import CohivaUser from "@/models/CohivaUser";
import PasswordResetToken from "@/models/PasswordResetToken";

const genericMessage =
  "If an account exists for that email, Cohiva has prepared password reset instructions.";

const getResetOrigin = (request: Request) => {
  const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const configured =
    process.env.COHIVA_APP_URL?.trim() ||
    (vercelProductionHost ? `https://${vercelProductionHost}` : "");
  const developmentMode = process.env.NODE_ENV !== "production";

  if (!configured) {
    if (developmentMode) return new URL(request.url).origin;
    throw new Error(
      "COHIVA_APP_URL or VERCEL_PROJECT_PRODUCTION_URL is required in production."
    );
  }

  const url = new URL(configured);
  if (!developmentMode && url.protocol !== "https:") {
    throw new Error("COHIVA_APP_URL must use HTTPS in production.");
  }

  return url.origin;
};

export async function POST(request: Request) {
  const rate = await checkRateLimit(request, "auth:forgot-password", {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many password reset requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = await request.json();
    const email = normalizeAuthEmail(body.email);

    if (!emailLooksValid(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const developmentMode = process.env.NODE_ENV !== "production";

    if (!developmentMode && !passwordResetEmailConfigured()) {
      console.error("Password reset requested, but SMTP is not configured.");
      return NextResponse.json(
        { error: "Password recovery is temporarily unavailable." },
        { status: 503 }
      );
    }

    let origin: string;
    try {
      origin = getResetOrigin(request);
    } catch (configurationError) {
      console.error("Password reset URL configuration error:", configurationError);
      return NextResponse.json(
        { error: "Password recovery is temporarily unavailable." },
        { status: 503 }
      );
    }

    await connectMongoDB();

    const rawUser = await CohivaUser.findOne({ email })
      .select({ _id: 1, email: 1 })
      .lean();

    if (!rawUser) {
      return NextResponse.json({ ok: true, message: genericMessage });
    }

    const user = rawUser as unknown as {
      _id: { toString(): string };
      email: string;
    };

    const rawToken = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(rawToken);

    await PasswordResetToken.deleteMany({ userId: user._id });
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: getPasswordResetExpiry(),
    });

    const resetUrl = `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(
      rawToken
    )}`;

    if (passwordResetEmailConfigured()) {
      await sendPasswordResetEmail({ to: user.email, resetUrl });
    }

    return NextResponse.json({
      ok: true,
      message: genericMessage,
      ...(developmentMode && !passwordResetEmailConfigured()
        ? { developmentResetUrl: resetUrl }
        : {}),
    });
  } catch (error) {
    console.error("Cohiva forgot-password error:", error);
    return NextResponse.json(
      { error: "Unable to prepare a password reset right now." },
      { status: 500 }
    );
  }
}
