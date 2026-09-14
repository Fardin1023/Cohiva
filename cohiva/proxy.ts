import { NextResponse } from "next/server";

/*
 * Cohiva authentication is enforced in protected server layouts and
 * authenticated API routes. Keep proxy.ts lightweight so it does not
 * open a database connection for every static asset/navigation request.
 */
export default function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
