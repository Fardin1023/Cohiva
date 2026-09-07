"use client";

import {
  useCallStateHooks,
  useDeviceList,
} from "@stream-io/video-react-sdk";

import {
  useState,
} from "react";

type MeetingDeviceSettingsProps = {
  open: boolean;
  onClose: () => void;
};

const MeetingDeviceSettings = ({
  open,
  onClose,
}: MeetingDeviceSettingsProps) => {
  const {
    useCameraState,
    useMicrophoneState,
    useSpeakerState,
  } = useCallStateHooks();

  const cameraState =
    useCameraState();

  const microphoneState =
    useMicrophoneState();

  const speakerState =
    useSpeakerState();

  const {
    camera,
    devices: cameraDevices,
    selectedDevice: selectedCamera,
    isMute: cameraOff,
  } = cameraState;

  const {
    microphone,
    devices: microphoneDevices,
    selectedDevice: selectedMicrophone,
    isMute: microphoneOff,
  } = microphoneState;

  const {
    speaker,
    devices: speakerDevices,
    selectedDevice: selectedSpeaker,
    isDeviceSelectionSupported:
      speakerSelectionSupported,
  } = speakerState;

  const {
    deviceList: cameraDeviceList,
  } = useDeviceList(
    cameraDevices,
    selectedCamera
  );

  const {
    deviceList: microphoneDeviceList,
  } = useDeviceList(
    microphoneDevices,
    selectedMicrophone
  );

  const [
    busy,
    setBusy,
  ] =
    useState<
      "camera" |
        "microphone" |
        "speaker" |
        null
    >(null);

  const [
    error,
    setError,
  ] =
    useState("");

  if (!open) {
    return null;
  }

  const selectCamera =
    async (
      deviceId: string
    ) => {
      try {
        setBusy(
          "camera"
        );
        setError("");

        await camera.select(
          deviceId
        );
      } catch (
        selectionError
      ) {
        console.error(
          "Camera selection error:",
          selectionError
        );

        setError(
          "Unable to switch camera. Check browser camera permission."
        );
      } finally {
        setBusy(null);
      }
    };

  const selectMicrophone =
    async (
      deviceId: string
    ) => {
      try {
        setBusy(
          "microphone"
        );
        setError("");

        await microphone.select(
          deviceId
        );
      } catch (
        selectionError
      ) {
        console.error(
          "Microphone selection error:",
          selectionError
        );

        setError(
          "Unable to switch microphone. Check browser microphone permission."
        );
      } finally {
        setBusy(null);
      }
    };

  const selectSpeaker =
    async (
      deviceId: string
    ) => {
      try {
        setBusy(
          "speaker"
        );
        setError("");

        await speaker.select(
          deviceId
        );
      } catch (
        selectionError
      ) {
        console.error(
          "Speaker selection error:",
          selectionError
        );

        setError(
          "Unable to switch speaker in this browser."
        );
      } finally {
        setBusy(null);
      }
    };

  const readableLabel = (
    label: string,
    fallback: string,
    index: number
  ) =>
    label?.trim() ||
    `${fallback} ${index + 1}`;

  return (
    <div
      className="fixed inset-0 z-[520] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Audio and video device settings"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section className="w-full max-w-[520px] overflow-hidden rounded-[28px] border border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[0_30px_100px_rgba(0,0,0,0.35)]">
        <header className="flex items-start justify-between gap-4 border-b border-[#403A35]/10 bg-white px-5 py-5 sm:px-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#A2AB73]">
              Cohiva devices
            </p>

            <h2 className="mt-1 text-xl font-black">
              Audio & video settings
            </h2>

            <p className="mt-1 text-xs leading-5 text-[#756E64]">
              Choose the camera, microphone and speaker you want to use for this meeting.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close device settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F9F0E0] text-lg font-black text-[#756E64] transition hover:bg-[#EFE3CF]"
          >
            ×
          </button>
        </header>

        <div className="max-h-[70dvh] space-y-4 overflow-y-auto p-5 sm:p-6">
          {error && (
            <div className="rounded-2xl bg-[#CC3A63]/10 px-4 py-3 text-xs font-bold text-[#CC3A63]">
              {error}
            </div>
          )}

          <DeviceSection
            icon="🎥"
            title="Camera"
            status={
              cameraOff
                ? "Camera is off"
                : "Camera is on"
            }
          >
            <select
              value={
                selectedCamera ??
                ""
              }
              disabled={
                busy ===
                "camera"
              }
              onChange={(event) =>
                void selectCamera(
                  event.target.value
                )
              }
              className="w-full rounded-2xl border border-[#403A35]/10 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#A2AB73] disabled:opacity-60"
            >
              {cameraDeviceList.map(
                (
                  device,
                  index
                ) => (
                  <option
                    key={`${device.deviceId}-${index}`}
                    value={
                      device.deviceId
                    }
                  >
                    {readableLabel(
                      device.label,
                      "Camera",
                      index
                    )}
                  </option>
                )
              )}
            </select>
          </DeviceSection>

          <DeviceSection
            icon="🎙"
            title="Microphone"
            status={
              microphoneOff
                ? "Microphone is muted"
                : "Microphone is active"
            }
          >
            <select
              value={
                selectedMicrophone ??
                ""
              }
              disabled={
                busy ===
                "microphone"
              }
              onChange={(event) =>
                void selectMicrophone(
                  event.target.value
                )
              }
              className="w-full rounded-2xl border border-[#403A35]/10 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#A2AB73] disabled:opacity-60"
            >
              {microphoneDeviceList.map(
                (
                  device,
                  index
                ) => (
                  <option
                    key={`${device.deviceId}-${index}`}
                    value={
                      device.deviceId
                    }
                  >
                    {readableLabel(
                      device.label,
                      "Microphone",
                      index
                    )}
                  </option>
                )
              )}
            </select>
          </DeviceSection>

          <DeviceSection
            icon="🔊"
            title="Speaker"
            status={
              speakerSelectionSupported
                ? "Choose your meeting audio output"
                : "Speaker selection is controlled by your browser or operating system"
            }
          >
            {speakerSelectionSupported ? (
              <select
                value={
                  selectedSpeaker ??
                  ""
                }
                disabled={
                  busy ===
                  "speaker"
                }
                onChange={(event) =>
                  void selectSpeaker(
                    event.target.value
                  )
                }
                className="w-full rounded-2xl border border-[#403A35]/10 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#A2AB73] disabled:opacity-60"
              >
                {(speakerDevices ?? []).map(
                  (
                    device,
                    index
                  ) => (
                    <option
                      key={`${device.deviceId}-${index}`}
                      value={
                        device.deviceId
                      }
                    >
                      {readableLabel(
                        device.label,
                        "Speaker",
                        index
                      )}
                    </option>
                  )
                )}
              </select>
            ) : (
              <div className="rounded-2xl bg-[#F9F0E0] px-4 py-3 text-xs font-semibold leading-5 text-[#756E64]">
                This browser does not expose speaker switching to websites. Your current system output will still work normally.
              </div>
            )}
          </DeviceSection>

          <div className="rounded-2xl bg-[#A2AB73]/10 px-4 py-3 text-[11px] font-semibold leading-5 text-[#667044]">
            Cohiva remembers supported device choices through Stream&apos;s device persistence, so your preferred camera and microphone can be reused in future meetings.
          </div>
        </div>

        <footer className="border-t border-[#403A35]/10 bg-white p-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-[#403A35] px-5 py-3 text-sm font-black text-white transition hover:bg-[#2F2A26]"
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
};

type DeviceSectionProps = {
  icon: string;
  title: string;
  status: string;
  children: React.ReactNode;
};

const DeviceSection = ({
  icon,
  title,
  status,
  children,
}: DeviceSectionProps) => (
  <section className="rounded-[22px] border border-[#403A35]/10 bg-white p-4">
    <div className="mb-3 flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F9F0E0] text-xl">
        {icon}
      </div>

      <div className="min-w-0">
        <h3 className="text-sm font-black">
          {title}
        </h3>

        <p className="mt-0.5 text-[10px] font-semibold text-[#756E64]">
          {status}
        </p>
      </div>
    </div>

    {children}
  </section>
);

export default MeetingDeviceSettings;
