import "server-only";

import connectMongoDB from "@/lib/mongodb";
import { getCurrentSession } from "@/lib/auth/session";
import type { CohivaUser } from "@/lib/auth/types";
import CohivaUserModel from "@/models/CohivaUser";

export const auth = async () => {
  const session =
    await getCurrentSession();

  const userId =
    session?.userId ?? null;

  return {
    userId,
    isAuthenticated:
      Boolean(userId),
  };
};

export const currentUser =
  async (): Promise<CohivaUser | null> => {
    const session =
      await getCurrentSession();

    if (!session) {
      return null;
    }

    await connectMongoDB();

    const rawUser =
      await CohivaUserModel.findById(
        session.userId
      )
        .select({
          email: 1,
          firstName: 1,
          lastName: 1,
          username: 1,
          imageUrl: 1,
          avatarIcon: 1,
        })
        .lean();

    if (!rawUser) {
      return null;
    }

    const user =
      rawUser as unknown as {
        _id: {
          toString(): string;
        };
        email: string;
        firstName?: string;
        lastName?: string;
        username?: string;
        imageUrl?: string;
        avatarIcon?: string;
      };

    const firstName =
      user.firstName?.trim() ||
      null;

    const lastName =
      user.lastName?.trim() ||
      null;

    const fullName =
      [
        firstName,
        lastName,
      ]
        .filter(Boolean)
        .join(" ") ||
      null;

    return {
      id: user._id.toString(),
      email: user.email,
      firstName,
      lastName,
      fullName,
      username:
        user.username?.trim() ||
        null,
      imageUrl:
        user.imageUrl?.trim() ||
        "",
      avatarIcon:
        user.avatarIcon?.trim() ||
        "",
    };
  };
