import {
  createHash,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";

import connectMongoDB from "@/lib/mongodb";
import AuthSession from "@/models/AuthSession";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-cohiva_session"
    : "cohiva_session";

export const SESSION_MAX_AGE_SECONDS =
  60 * 60 * 24 * 30;

const hashSessionToken = (
  token: string
) =>
  createHash("sha256")
    .update(token)
    .digest("hex");

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure:
    process.env.NODE_ENV ===
    "production",
  path: "/",
  maxAge:
    SESSION_MAX_AGE_SECONDS,
  priority: "high" as const,
};

export const createAuthSession = async (
  userId: string
) => {
  await connectMongoDB();

  const token =
    randomBytes(32)
      .toString("base64url");

  const tokenHash =
    hashSessionToken(token);

  const expiresAt =
    new Date(
      Date.now() +
        SESSION_MAX_AGE_SECONDS *
          1000
    );

  await AuthSession.create({
    userId,
    tokenHash,
    expiresAt,
    lastUsedAt: new Date(),
  });

  const cookieStore =
    await cookies();

  cookieStore.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions
  );
};

export const deleteCurrentAuthSession =
  async () => {
    const cookieStore =
      await cookies();

    const token =
      cookieStore.get(
        SESSION_COOKIE_NAME
      )?.value;

    if (token) {
      await connectMongoDB();

      await AuthSession.deleteOne({
        tokenHash:
          hashSessionToken(token),
      });
    }

    cookieStore.set(
      SESSION_COOKIE_NAME,
      "",
      {
        ...sessionCookieOptions,
        maxAge: 0,
        expires: new Date(0),
      }
    );
  };

export const getCurrentSession =
  async () => {
    const cookieStore =
      await cookies();

    const token =
      cookieStore.get(
        SESSION_COOKIE_NAME
      )?.value;

    if (!token) {
      return null;
    }

    await connectMongoDB();

    const rawSession =
      await AuthSession.findOne({
        tokenHash:
          hashSessionToken(token),
        expiresAt: {
          $gt: new Date(),
        },
      })
        .select({
          userId: 1,
          expiresAt: 1,
        })
        .lean();

    if (!rawSession) {
      return null;
    }

    const session =
      rawSession as unknown as {
        userId: {
          toString(): string;
        };
        expiresAt: Date;
      };

    return {
      userId:
        session.userId.toString(),
      expiresAt:
        session.expiresAt,
    };
  };
