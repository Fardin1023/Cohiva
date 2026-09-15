import { NextResponse } from "next/server";

import {
  auth,
  currentUser,
} from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import CohivaUser from "@/models/CohivaUser";

const ALLOWED_AVATAR_ICONS = new Set([
  "",
  "user",
  "student",
  "book",
  "idea",
  "sparkles",
  "leaf",
  "rocket",
  "smile",
]);

const cleanName = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
};

const cleanAvatarIcon = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  const icon = value.trim();

  return ALLOWED_AVATAR_ICONS.has(icon)
    ? icon
    : "";
};

const cleanImageUrl = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  const imageUrl = value.trim();

  if (!imageUrl) {
    return "";
  }

  if (imageUrl.length > 400_000) {
    throw new Error("IMAGE_TOO_LARGE");
  }

  const safeDataImage =
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(
      imageUrl
    );

  const safeHttpsImage =
    /^https:\/\//i.test(imageUrl);

  if (!safeDataImage && !safeHttpsImage) {
    throw new Error("INVALID_IMAGE");
  }

  return imageUrl;
};

export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const firstName = cleanName(
      body.firstName
    );
    const lastName = cleanName(
      body.lastName
    );
    const avatarIcon = cleanAvatarIcon(
      body.avatarIcon
    );
    const imageUrl = cleanImageUrl(
      body.imageUrl
    );

    if (!firstName) {
      return NextResponse.json(
        {
          error: "First name is required.",
        },
        { status: 400 }
      );
    }

    await connectMongoDB();

    const updated =
      await CohivaUser.findByIdAndUpdate(
        userId,
        {
          $set: {
            firstName,
            lastName,
            avatarIcon,
            imageUrl,
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!updated) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    const user = await currentUser();

    return NextResponse.json(
      { user },
      {
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "IMAGE_TOO_LARGE"
    ) {
      return NextResponse.json(
        {
          error:
            "That profile image is too large.",
        },
        { status: 400 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "INVALID_IMAGE"
    ) {
      return NextResponse.json(
        {
          error:
            "Use a valid PNG, JPG or WebP profile image.",
        },
        { status: 400 }
      );
    }

    console.error(
      "Cohiva profile update error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update your profile right now.",
      },
      { status: 500 }
    );
  }
}
