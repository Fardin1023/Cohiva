"use client";

import { useEffect } from "react";

import { useCohivaRtc } from "./CohivaRtcProvider";

export default function CohivaRtcDeviceSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    audioInputs,
    videoInputs,
    audioOutputs,
    selectedAudioInput,
    selectedVideoInput,
    selectedAudioOutput,
    setSelectedAudioInput,
    setSelectedVideoInput,
    setSelectedAudioOutput,
    micOn,
    cameraOn,
    refreshDevices,
  } = useCohivaRtc();

  useEffect(() => {
    if (open) {
      void refreshDevices();
    }
  }, [open, refreshDevices]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[650] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close RTC device settings"
        className="absolute inset-0"
        onClick={onClose}
      />

      <section className="relative z-10 w-full max-w-[520px] rounded-[28px] bg-[#FFF7EB] p-5 text-[#3D3732] shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
              Cohiva RTC
            </p>
            <h2 className="mt-1 text-xl font-black">
              Camera & microphone
            </h2>
            <p className="mt-2 text-xs font-semibold leading-5 text-[#756E64]">
              Stop an active device before switching to another one.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F9F0E0] font-black text-[#756E64]"
          >
            ×
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-xs font-black text-[#3D3732]">
            Microphone
            <select
              value={selectedAudioInput}
              onChange={(event) =>
                setSelectedAudioInput(event.target.value)
              }
              disabled={micOn}
              className="mt-2 h-11 w-full rounded-xl border border-[#403A35]/15 bg-white px-3 text-sm font-semibold outline-none disabled:opacity-55"
            >
              {audioInputs.length === 0 && (
                <option value="">Default microphone</option>
              )}
              {audioInputs.map((device, index) => (
                <option
                  key={device.deviceId}
                  value={device.deviceId}
                >
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-black text-[#3D3732]">
            Camera
            <select
              value={selectedVideoInput}
              onChange={(event) =>
                setSelectedVideoInput(event.target.value)
              }
              disabled={cameraOn}
              className="mt-2 h-11 w-full rounded-xl border border-[#403A35]/15 bg-white px-3 text-sm font-semibold outline-none disabled:opacity-55"
            >
              {videoInputs.length === 0 && (
                <option value="">Default camera</option>
              )}
              {videoInputs.map((device, index) => (
                <option
                  key={device.deviceId}
                  value={device.deviceId}
                >
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-black text-[#3D3732]">
            Speaker
            <select
              value={selectedAudioOutput}
              onChange={(event) =>
                setSelectedAudioOutput(event.target.value)
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#403A35]/15 bg-white px-3 text-sm font-semibold outline-none"
            >
              {audioOutputs.length === 0 && (
                <option value="">Browser default speaker</option>
              )}
              {audioOutputs.map((device, index) => (
                <option
                  key={device.deviceId}
                  value={device.deviceId}
                >
                  {device.label || `Speaker ${index + 1}`}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-[10px] font-semibold leading-4 text-[#8A8177]">
              Some browsers manage speaker output through the operating system instead.
            </span>
          </label>
        </div>
      </section>
    </div>
  );
}
