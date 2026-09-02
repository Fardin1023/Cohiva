"use client";

import {
  CallingState,
  CallControls,
  SpeakerLayout,
  StreamCall,
  StreamTheme,
  VideoPreview,
  useCallStateHooks,
  useStreamVideoClient,
  type Call,
} from "@stream-io/video-react-sdk";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

type MeetingRoomProps = {
  callId: string;
  shouldCreate: boolean;
};

/* =========================================================
   MAIN MEETING ROOM
========================================================= */

const MeetingRoom = ({
  callId,
  shouldCreate,
}: MeetingRoomProps) => {
  const client =
    useStreamVideoClient();

  const [call, setCall] =
    useState<Call>();

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!client) {
      return;
    }

    let cancelled = false;

    const streamCall =
      client.call(
        "default",
        callId
      );

    const loadCall = async () => {
      try {
        if (shouldCreate) {
          /*
           * New Meeting:
           * Create the Stream call if it
           * doesn't exist yet.
           */
          await streamCall.getOrCreate({
            data: {
              custom: {
                title:
                  "Cohiva Meeting",
              },
            },
          });
        } else {
          /*
           * Join Meeting:
           * The meeting must already exist.
           */
          await streamCall.get();
        }

        if (!cancelled) {
          setCall(streamCall);
        }
      } catch (err) {
        console.error(
          "Meeting loading error:",
          err
        );

        if (!cancelled) {
          setError(
            shouldCreate
              ? "Unable to create this meeting."
              : "This meeting could not be found."
          );
        }
      }
    };

    void loadCall();

    return () => {
      cancelled = true;

      void streamCall
        .leave()
        .catch(() => {
          // Safe cleanup.
        });
    };
  }, [
    client,
    callId,
    shouldCreate,
  ]);

  /* Stream client loading */

  if (!client) {
    return (
      <MeetingLoading
        text="Connecting to Stream..."
      />
    );
  }

  /* Meeting loading */

  if (!call && !error) {
    return (
      <MeetingLoading
        text={
          shouldCreate
            ? "Creating your Cohiva room..."
            : "Finding your Cohiva room..."
        }
      />
    );
  }

  /* Meeting error */

  if (error) {
    return (
      <MeetingError
        message={error}
      />
    );
  }

  if (!call) {
    return null;
  }

  return (
    <StreamCall call={call}>
      <StreamTheme className="cohiva-stream-theme">
        <MeetingExperience
          callId={callId}
        />
      </StreamTheme>
    </StreamCall>
  );
};

export default MeetingRoom;

/* =========================================================
   MEETING EXPERIENCE
========================================================= */

const MeetingExperience = ({
  callId,
}: {
  callId: string;
}) => {
  const {
    useCallCallingState,
  } = useCallStateHooks();

  const callingState =
    useCallCallingState();

  if (
    callingState ===
    CallingState.JOINED
  ) {
    return (
      <LiveMeeting
        callId={callId}
      />
    );
  }

  return (
    <MeetingLobby
      callId={callId}
    />
  );
};

/* =========================================================
   PRE-JOIN LOBBY
========================================================= */

const MeetingLobby = ({
  callId,
}: {
  callId: string;
}) => {
  const router = useRouter();

  const {
    useCameraState,
    useMicrophoneState,
    useCallCallingState,
  } = useCallStateHooks();

  const {
    camera,
    isMute: cameraOff,
  } = useCameraState();

  const {
    microphone,
    isMute: microphoneOff,
  } = useMicrophoneState();

  const callingState =
    useCallCallingState();

  const [error, setError] =
    useState("");

  const [copied, setCopied] =
    useState(false);

  const joining =
    callingState ===
    CallingState.JOINING;

  const joinMeeting =
    async () => {
      try {
        setError("");

        /*
         * We are inside StreamCall,
         * so get the call through
         * the camera controller.
         */
        const call =
          camera.call;

        if (!call) {
          throw new Error(
            "Meeting is not ready."
          );
        }

        await call.join();
      } catch (err) {
        console.error(
          "Join meeting error:",
          err
        );

        setError(
          "Unable to join the meeting. Check your connection and permissions."
        );
      }
    };

  const toggleCamera =
    async () => {
      try {
        setError("");

        await camera.toggle();
      } catch (err) {
        console.error(
          "Camera error:",
          err
        );

        setError(
          "Cohiva could not access your camera. Check your browser permissions."
        );
      }
    };

  const toggleMicrophone =
    async () => {
      try {
        setError("");

        await microphone.toggle();
      } catch (err) {
        console.error(
          "Microphone error:",
          err
        );

        setError(
          "Cohiva could not access your microphone. Check your browser permissions."
        );
      }
    };

  const copyInviteLink =
    async () => {
      const inviteLink =
        `${window.location.origin}/meeting/${callId}`;

      await navigator.clipboard.writeText(
        inviteLink
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1800);
    };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9F0E0] p-4 sm:p-6">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-[#403A35]/10 bg-[#FFF7EB] shadow-[0_30px_90px_rgba(61,55,50,0.16)] lg:grid-cols-[1.2fr_0.8fr]">

        {/* ==========================
            CAMERA PREVIEW
        ========================== */}

        <section className="relative min-h-[420px] overflow-hidden bg-[#302B27] lg:min-h-[650px]">
          <div className="absolute left-6 top-6 z-20 rounded-full bg-[#CC3A63] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white">
            Cohiva Preview
          </div>

          <div className="h-full min-h-[420px] w-full lg:min-h-[650px]">
            <VideoPreview className="h-full w-full object-cover" />
          </div>

          {cameraOff && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#403A35]">
              <div className="text-center">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#CC3A63]/20 text-4xl">
                  📷
                </div>

                <p className="mt-5 text-lg font-bold text-[#FFF7EB]">
                  Camera is off
                </p>

                <p className="mt-1 text-sm text-[#FFF7EB]/60">
                  Turn it on when
                  you&apos;re ready.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ==========================
            LOBBY CONTROLS
        ========================== */}

        <section className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <p className="text-xs font-black uppercase tracking-[0.23em] text-[#A2AB73]">
            Ready to meet?
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">
            Check yourself first ✨
          </h1>

          <p className="mt-3 leading-7 text-[#756E64]">
            Make sure your camera
            and microphone are how
            you want them before
            entering the room.
          </p>

          {/* Device controls */}

          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={
                toggleCamera
              }
              className={`rounded-2xl border px-4 py-4 text-sm font-bold transition-all duration-200 ${
                cameraOff
                  ? "border-[#403A35]/10 bg-[#F1E6D4] text-[#3D3732] hover:-translate-y-1"
                  : "border-[#A2AB73]/30 bg-[#A2AB73]/15 text-[#737C4C] hover:-translate-y-1"
              }`}
            >
              <span className="mb-1 block text-2xl">
                {cameraOff
                  ? "📷"
                  : "🎥"}
              </span>

              {cameraOff
                ? "Turn camera on"
                : "Camera on"}
            </button>

            <button
              type="button"
              onClick={
                toggleMicrophone
              }
              className={`rounded-2xl border px-4 py-4 text-sm font-bold transition-all duration-200 ${
                microphoneOff
                  ? "border-[#403A35]/10 bg-[#F1E6D4] text-[#3D3732] hover:-translate-y-1"
                  : "border-[#A2AB73]/30 bg-[#A2AB73]/15 text-[#737C4C] hover:-translate-y-1"
              }`}
            >
              <span className="mb-1 block text-2xl">
                {microphoneOff
                  ? "🔇"
                  : "🎙️"}
              </span>

              {microphoneOff
                ? "Turn mic on"
                : "Microphone on"}
            </button>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl bg-[#CC3A63]/10 px-4 py-3 text-sm font-semibold text-[#CC3A63]">
              {error}
            </div>
          )}

          {/* Join */}

          <button
            type="button"
            onClick={
              joinMeeting
            }
            disabled={joining}
            className="mt-7 w-full rounded-2xl bg-[#CC3A63] px-5 py-4 text-base font-black text-white shadow-[0_12px_28px_rgba(204,58,99,0.25)] transition-all duration-200 hover:-translate-y-1 hover:bg-[#B83057] hover:shadow-[0_18px_36px_rgba(204,58,99,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {joining
              ? "Joining..."
              : "Join Meeting"}
          </button>

          {/* Invite link */}

          <button
            type="button"
            onClick={
              copyInviteLink
            }
            className="mt-3 w-full rounded-2xl border border-[#403A35]/10 bg-[#F9F0E0] px-5 py-3.5 text-sm font-bold text-[#3D3732] transition hover:bg-[#F1E6D4]"
          >
            {copied
              ? "✓ Invite link copied"
              : "Copy invite link"}
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
            className="mt-5 text-sm font-bold text-[#756E64] transition hover:text-[#CC3A63]"
          >
            ← Back to dashboard
          </button>

          <div className="mt-7 rounded-2xl bg-[#A2AB73]/10 p-4">
            <p className="text-xs font-semibold text-[#737C4C]">
              Meeting ID
            </p>

            <p className="mt-1 break-all font-mono text-xs text-[#3D3732]">
              {callId}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
};

/* =========================================================
   LIVE VIDEO MEETING
========================================================= */

const LiveMeeting = ({
  callId,
}: {
  callId: string;
}) => {
  const router = useRouter();

  const [copied, setCopied] =
    useState(false);

  const copyInviteLink =
    async () => {
      const link =
        `${window.location.origin}/meeting/${callId}`;

      await navigator.clipboard.writeText(
        link
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1800);
    };

  return (
    <main className="flex min-h-screen flex-col bg-[#24211F] text-white">
      {/* Meeting header */}

      <header className="flex h-[72px] items-center justify-between border-b border-white/10 bg-[#302B27] px-5 sm:px-7">
        <div>
          <p className="text-lg font-black">
            Cohiva Meeting
          </p>

          <p className="mt-0.5 hidden text-xs text-white/50 sm:block">
            {callId}
          </p>
        </div>

        <button
          type="button"
          onClick={
            copyInviteLink
          }
          className="rounded-xl bg-[#FFF7EB]/10 px-4 py-2 text-sm font-bold text-[#FFF7EB] transition hover:bg-[#CC3A63]"
        >
          {copied
            ? "Copied ✓"
            : "Invite people"}
        </button>
      </header>

      {/* Video area */}

      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-5">
        <div className="h-full w-full overflow-hidden rounded-[24px]">
          <SpeakerLayout
            participantsBarPosition="right"
          />
        </div>
      </div>

      {/* Controls */}

      <footer className="flex min-h-[88px] items-center justify-center border-t border-white/10 bg-[#302B27] px-4 py-3">
        <CallControls
          onLeave={() => {
            router.push("/");
          }}
        />
      </footer>
    </main>
  );
};

/* =========================================================
   LOADING
========================================================= */

const MeetingLoading = ({
  text,
}: {
  text: string;
}) => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9F0E0]">
      <div className="text-center">
        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

        <p className="mt-5 font-bold text-[#756E64]">
          {text}
        </p>
      </div>
    </main>
  );
};

/* =========================================================
   ERROR
========================================================= */

const MeetingError = ({
  message,
}: {
  message: string;
}) => {
  const router =
    useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9F0E0] p-5">
      <div className="w-full max-w-md rounded-[28px] bg-[#FFF7EB] p-8 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#CC3A63]/10 text-2xl">
          !
        </div>

        <h1 className="mt-5 text-2xl font-black text-[#3D3732]">
          Meeting unavailable
        </h1>

        <p className="mt-3 text-sm leading-6 text-[#756E64]">
          {message}
        </p>

        <button
          type="button"
          onClick={() =>
            router.push("/")
          }
          className="mt-6 rounded-2xl bg-[#CC3A63] px-6 py-3 font-bold text-white transition hover:bg-[#B83057]"
        >
          Return Home
        </button>
      </div>
    </main>
  );
};