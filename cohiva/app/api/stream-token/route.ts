import { auth, currentUser } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const clerkUser = await currentUser();

    if (!clerkUser) {
      return Response.json(
        {
          error: "User not found",
        },
        {
          status: 404,
        }
      );
    }

    const apiKey =
      process.env.NEXT_PUBLIC_STREAM_API_KEY;

    const apiSecret =
      process.env.STREAM_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error(
        "Stream API key or secret is missing."
      );

      return Response.json(
        {
          error:
            "Stream configuration is missing.",
        },
        {
          status: 500,
        }
      );
    }

    const streamClient =
      new StreamClient(
        apiKey,
        apiSecret
      );

    const fullName =
      [
        clerkUser.firstName,
        clerkUser.lastName,
      ]
        .filter(Boolean)
        .join(" ") ||
      clerkUser.username ||
      "Cohiva User";

    /*
     * Keep the Stream user information
     * synchronized with Clerk.
     */
    await streamClient.upsertUsers([
      {
        id: userId,
        role: "user",
        name: fullName,
        image: clerkUser.imageUrl,
      },
    ]);

    /*
     * Create a short-lived token.
     * Valid for 4 hours.
     */
    const token =
      streamClient.generateUserToken({
        user_id: userId,
        validity_in_seconds:
          60 * 60 * 4,
      });

    return Response.json({
      token,
    });
  } catch (error) {
    console.error(
      "Stream token error:",
      error
    );

    return Response.json(
      {
        error:
          "Unable to generate Stream token.",
      },
      {
        status: 500,
      }
    );
  }
}