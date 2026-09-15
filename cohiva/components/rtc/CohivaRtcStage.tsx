"use client";

import {
  useEffect,
  useMemo,
  useRef,
} from "react";

import {
  BookOpen,
  GraduationCap,
  Leaf,
  Lightbulb,
  Rocket,
  Smile,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  useCohivaRtc,
  type CohivaRtcParticipant,
} from "./CohivaRtcProvider";

const avatarIconMap = {
  user: UserRound,
  student: GraduationCap,
  book: BookOpen,
  idea: Lightbulb,
  sparkles: Sparkles,
  leaf: Leaf,
  rocket: Rocket,
  smile: Smile,
} as const;

const avatarToneMap = {
  user: "bg-[#FFF7EB] text-[#B9687C]",
  student: "bg-[#EEE8FA] text-[#6B4DB5]",
  book: "bg-[#E7F0F8] text-[#37688F]",
  idea: "bg-[#FFF0D7] text-[#B16F0C]",
  sparkles: "bg-[#F6E7EC] text-[#A04E64]",
  leaf: "bg-[#E3F1E8] text-[#397451]",
  rocket: "bg-[#F9E5E2] text-[#B24435]",
  smile: "bg-[#FAEDD9] text-[#A96A16]",
} as const;

type AvatarIconKey = keyof typeof avatarIconMap;

const initials = (name: string) => {
  const pieces = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return (
    pieces.map((piece) => piece[0]?.toUpperCase()).join("") ||
    "C"
  );
};

const VideoView = ({
  stream,
  muted = false,
  className = "",
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) => {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
    />
  );
};

const AudioView = ({
  stream,
  sinkId,
}: {
  stream: MediaStream | null;
  sinkId: string;
}) => {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    ref.current.srcObject = stream
      ? new MediaStream(stream.getAudioTracks())
      : null;
  }, [stream]);

  useEffect(() => {
    if (!ref.current || !sinkId) return;

    const element = ref.current as HTMLAudioElement & {
      setSinkId?: (deviceId: string) => Promise<void>;
    };

    if (typeof element.setSinkId === "function") {
      void element.setSinkId(sinkId).catch(() => {});
    }
  }, [sinkId]);

  return <audio ref={ref} autoPlay playsInline />;
};

const AvatarFallback = ({
  participant,
}: {
  participant: CohivaRtcParticipant;
}) => {
  const avatarKey = participant.avatarIcon as
    | AvatarIconKey
    | undefined;
  const Icon = avatarKey ? avatarIconMap[avatarKey] : undefined;
  const tone = avatarKey
    ? avatarToneMap[avatarKey]
    : "bg-[#CC3A63] text-white";

  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#554D46,#282421_68%)]">
      <div
        className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/15 text-2xl font-black shadow-xl sm:h-24 sm:w-24 sm:text-3xl ${tone}`}
      >
        {participant.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={participant.image}
            alt={`${participant.name} profile`}
            className="h-full w-full object-cover"
          />
        ) : Icon ? (
          <Icon
            aria-hidden="true"
            className="h-8 w-8 sm:h-10 sm:w-10"
          />
        ) : (
          initials(participant.name)
        )}
      </div>
    </div>
  );
};

const ParticipantTile = ({
  participant,
  stream,
  muted = false,
  sinkId,
}: {
  participant: CohivaRtcParticipant;
  stream: MediaStream | null;
  muted?: boolean;
  sinkId: string;
}) => {
  const videoStream = useMemo(() => {
    if (!stream) return null;

    const tracks = stream.getVideoTracks();
    return tracks.length ? new MediaStream(tracks) : null;
  }, [stream]);

  const hasVideo = Boolean(
    videoStream?.getVideoTracks().length
  );

  return (
    <div className="relative min-h-0 overflow-hidden rounded-[20px] bg-[#24211F] shadow-[0_12px_35px_rgba(0,0,0,0.25)]">
      <div className="h-full min-h-[180px] w-full bg-black sm:min-h-[220px]">
        {hasVideo ? (
          <VideoView
            stream={videoStream}
            muted={muted}
            className="h-full w-full object-cover"
          />
        ) : (
          <AvatarFallback participant={participant} />
        )}
      </div>

      {!muted && (
        <AudioView stream={stream} sinkId={sinkId} />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-3 pb-3 pt-10 text-white">
        <div className="min-w-0">
          <p className="truncate text-xs font-black sm:text-sm">
            {participant.name}
            {participant.isHost ? " · Host" : ""}
            {muted ? " · You" : ""}
          </p>
        </div>
      </div>
    </div>
  );
};

export default function CohivaRtcStage() {
  const {
    status,
    error,
    notice,
    participants,
    selfUserId,
    remoteMedia,
    localCameraStream,
    localScreenStream,
    selectedAudioOutput,
  } = useCohivaRtc();

  const selfParticipant =
    participants.find(
      (participant) => participant.userId === selfUserId
    ) || {
      userId: selfUserId || "local",
      name: "You",
      isHost: false,
    };

  const remoteParticipants = participants.filter(
    (participant) => participant.userId !== selfUserId
  );

  const screenShares = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      stream: MediaStream;
    }> = [];

    if (
      localScreenStream &&
      localScreenStream.getVideoTracks().length
    ) {
      items.push({
        id: `${selfUserId || "local"}:screen`,
        name: "Your screen",
        stream: localScreenStream,
      });
    }

    for (const participant of remoteParticipants) {
      const stream =
        remoteMedia[participant.userId]?.screenStream;

      if (stream?.getVideoTracks().length) {
        items.push({
          id: `${participant.userId}:screen`,
          name: `${participant.name}'s screen`,
          stream,
        });
      }
    }

    return items;
  }, [
    localScreenStream,
    remoteMedia,
    remoteParticipants,
    selfUserId,
  ]);

  const participantTiles = [
    {
      participant: selfParticipant,
      stream: localCameraStream,
      muted: true,
    },
    ...remoteParticipants.map((participant) => ({
      participant,
      stream:
        remoteMedia[participant.userId]?.cameraStream || null,
      muted: false,
    })),
  ];

  const gridClass =
    participantTiles.length <= 1
      ? "grid-cols-1"
      : participantTiles.length === 2
        ? "grid-cols-1 md:grid-cols-2"
        : participantTiles.length <= 4
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#181614]">
      {screenShares.length > 0 ? (
        <div className="flex h-full min-h-0 flex-col gap-2 p-2 lg:flex-row">
          <div className="min-h-0 flex-1 overflow-hidden rounded-[20px] bg-black">
            <VideoView
              stream={screenShares[0].stream}
              className="h-full w-full object-contain"
            />
            <div className="pointer-events-none absolute left-5 top-5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-black text-white backdrop-blur-sm">
              {screenShares[0].name}
            </div>
          </div>

          <div className="grid max-h-[42%] shrink-0 grid-cols-2 gap-2 overflow-auto lg:max-h-none lg:w-[280px] lg:grid-cols-1">
            {participantTiles.map((tile) => (
              <ParticipantTile
                key={tile.participant.userId}
                participant={tile.participant}
                stream={tile.stream}
                muted={tile.muted}
                sinkId={selectedAudioOutput}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`grid h-full min-h-0 gap-2 overflow-auto p-2 ${gridClass}`}
        >
          {participantTiles.map((tile) => (
            <ParticipantTile
              key={tile.participant.userId}
              participant={tile.participant}
              stream={tile.stream}
              muted={tile.muted}
              sinkId={selectedAudioOutput}
            />
          ))}
        </div>
      )}

      {(status === "connecting" ||
        status === "reconnecting") && (
        <div className="absolute inset-x-0 top-3 z-40 mx-auto flex w-fit items-center gap-2 rounded-full bg-[#FFF7EB] px-4 py-2 text-xs font-black text-[#403A35] shadow-xl">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#CC3A63]" />
          {status === "connecting"
            ? "Connecting Cohiva RTC..."
            : "Connection interrupted · reconnecting..."}
        </div>
      )}

      {notice && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-[#FFF7EB] px-4 py-2 text-xs font-black text-[#403A35] shadow-2xl">
          {notice}
        </div>
      )}

      {(status === "error" || status === "ended") && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
          <div className="max-w-md rounded-[24px] bg-[#FFF7EB] p-6 text-center text-[#403A35] shadow-2xl">
            <div className="text-3xl">
              {status === "ended" ? "⏹" : "⚠"}
            </div>
            <h3 className="mt-3 text-lg font-black">
              {status === "ended"
                ? "Meeting ended"
                : "RTC connection problem"}
            </h3>
            <p className="mt-2 text-sm font-semibold text-[#756E64]">
              {status === "ended"
                ? "The host ended this Cohiva meeting."
                : error ||
                  "Cohiva could not connect to the RTC server."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
