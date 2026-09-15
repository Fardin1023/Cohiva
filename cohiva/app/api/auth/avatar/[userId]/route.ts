import { auth } from "@/lib/auth/server";
import connectMongoDB from "@/lib/mongodb";
import CohivaUser from "@/models/CohivaUser";

const DATA_IMAGE =
  /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ userId: string }>;
  }
) {
  const { userId: requesterId } = await auth();

  if (!requesterId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { userId } = await context.params;

  if (!userId) {
    return new Response("Not found", { status: 404 });
  }

  await connectMongoDB();

  const user = await CohivaUser.findById(userId)
    .select({ imageUrl: 1 })
    .lean();

  const imageUrl =
    typeof user?.imageUrl === "string"
      ? user.imageUrl.trim()
      : "";

  if (!imageUrl) {
    return new Response("Not found", { status: 404 });
  }

  const match = imageUrl.match(DATA_IMAGE);

  if (match) {
    const bytes = Buffer.from(match[2], "base64");

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": match[1],
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    return Response.redirect(imageUrl, 302);
  }

  return new Response("Not found", { status: 404 });
}
