"use client";

import {
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  Settings2,
  Video,
  VideoOff,
} from "lucide-react";

import { useCohivaRtc } from "./CohivaRtcProvider";

const controlClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-45";

export default function CohivaRtcControls({
  onOpenDevices,
}: {
  onOpenDevices: () => void;
}) {
  const {
    status,
    micOn,
    cameraOn,
    screenOn,
    canUseMic,
    canUseCamera,
    canShareScreen,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
  } = useCohivaRtc();

  const ready = status === "joined";

  return (
    <>
      <button
        type="button"
        onClick={() => void toggleMicrophone()}
        disabled={!ready || (!micOn && !canUseMic)}
        aria-label={micOn ? "Mute microphone" : "Turn on microphone"}
        title={micOn ? "Mute microphone" : "Turn on microphone"}
        className={`${controlClass} ${
          micOn ? "bg-[#4A4540] hover:bg-[#5A544E]" : "bg-[#E34848] hover:bg-[#C93434]"
        }`}
      >
        {micOn ? <Mic size={17} /> : <MicOff size={17} />}
      </button>

      <button
        type="button"
        onClick={() => void toggleCamera()}
        disabled={!ready || (!cameraOn && !canUseCamera)}
        aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
        title={cameraOn ? "Turn camera off" : "Turn camera on"}
        className={`${controlClass} ${
          cameraOn ? "bg-[#4A4540] hover:bg-[#5A544E]" : "bg-[#E34848] hover:bg-[#C93434]"
        }`}
      >
        {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
      </button>

      <button
        type="button"
        onClick={() => void toggleScreenShare()}
        disabled={!ready || (!screenOn && !canShareScreen)}
        aria-label={screenOn ? "Stop screen sharing" : "Share screen"}
        title={screenOn ? "Stop screen sharing" : "Share screen"}
        className={`${controlClass} ${
          screenOn
            ? "bg-[#A2AB73] hover:bg-[#929B65]"
            : "bg-[#4A4540] hover:bg-[#5A544E]"
        }`}
      >
        {screenOn ? <MonitorX size={18} /> : <MonitorUp size={18} />}
      </button>

      <button
        type="button"
        onClick={onOpenDevices}
        aria-label="RTC device settings"
        title="RTC device settings"
        className={`${controlClass} bg-[#4A4540] hover:bg-[#5A544E]`}
      >
        <Settings2 size={17} />
      </button>
    </>
  );
}
