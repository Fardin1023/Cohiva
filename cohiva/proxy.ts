import { NextRequest, NextResponse } from "next/server";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const isSameOriginRequest = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
    return originUrl.host === host;
  } catch {
    return false;
  }
};

/*
 * Authentication itself remains enforced in protected server layouts and
 * authenticated API routes. The proxy only adds a lightweight browser-origin
 * check for unsafe API requests so cross-site pages cannot use Cohiva's
 * session cookie to submit mutations.
 */
export default function proxy(request: NextRequest) {
  const isBlobUploadCallback =
    request.nextUrl.pathname === "/api/recordings/upload";

  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    UNSAFE_METHODS.has(request.method) &&
    !isBlobUploadCallback &&
    !isSameOriginRequest(request)
  ) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
