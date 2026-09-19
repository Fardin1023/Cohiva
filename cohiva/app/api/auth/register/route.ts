import { NextResponse } from "next/server";

import {
  createAuthSession,
  deleteCurrentAuthSession,
} from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import connectMongoDB from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/security/rateLimit";
import CohivaUser from "@/models/CohivaUser";

const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().slice(0, 320);
};

const cleanName = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
};

const emailLooksValid = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const passwordLooksValid = (password: string) =>
  password.length >= 8 &&
  password.length <= 128 &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password);

const isDuplicateKeyError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
  );

export async function POST(request: Request) {
  const rate = await checkRateLimit(request, "auth:register", {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many account creation attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = await request.json();
    const firstName = cleanName(body.firstName);
    const lastName = cleanName(body.lastName);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    if (!firstName) {
      return NextResponse.json({ error: "First name is required." }, { status: 400 });
    }
    if (!emailLooksValid(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
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

    const existing = await CohivaUser.exists({ email });
    if (existing) {
      return NextResponse.json(
        { error: "An account already exists with this email." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const username = email.split("@")[0].slice(0, 80);
    const user = await CohivaUser.create({
      email,
      firstName,
      lastName,
      username,
      imageUrl: "",
      avatarIcon: "",
      passwordHash,
    });

    await deleteCurrentAuthSession();
    await createAuthSession(user._id.toString());

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "An account already exists with this email." },
        { status: 409 }
      );
    }

    console.error("Cohiva registration error:", error);
    return NextResponse.json(
      { error: "Unable to create your account right now." },
      { status: 500 }
    );
  }
}
