import type {
  ReactNode,
} from "react";

import {
  auth,
} from "@/lib/auth/server";

import {
  redirect,
} from "next/navigation";

import StreamVideoProvider
  from "@/components/providers/StreamVideoProvider";

/*
 * =========================================================
 * STREAM VIDEO STYLES
 * =========================================================
 *
 * IMPORTANT:
 *
 * These styles are required for:
 *
 * - microphone button
 * - camera button
 * - reactions
 * - screen sharing
 * - leave button
 * - SpeakerLayout
 * - ParticipantView
 * - Stream notifications
 *
 * We import them ONLY inside the meeting route group so
 * sign-in/dashboard pages do not unnecessarily load the
 * Stream meeting stylesheet.
 * =========================================================
 */

import "@stream-io/video-react-sdk/dist/css/styles.css";

/* =========================================================
   TYPES
========================================================= */

type MeetingLayoutProps = {
  children: ReactNode;
};

/* =========================================================
   MEETING LAYOUT
========================================================= */

const MeetingLayout = async ({
  children,
}: MeetingLayoutProps) => {
  const {
    isAuthenticated,
  } =
    await auth();

  /*
   * Signed-out users should never initialize
   * the Stream Video provider.
   */

  if (
    !isAuthenticated
  ) {
    redirect(
      "/sign-in"
    );
  }

  return (
    <StreamVideoProvider>

      <div className="min-h-dvh w-full bg-[#24211F]">

        {children}

      </div>

    </StreamVideoProvider>
  );
};

export default MeetingLayout;