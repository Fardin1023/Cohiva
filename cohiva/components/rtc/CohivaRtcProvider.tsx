"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Device } from "mediasoup-client";

import { CohivaBrowserMeetingRecorder } from "@/lib/recordings/browserMeetingRecorder";

export type CohivaRtcStatus =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "joined"
  | "ended"
  | "error";

export type CohivaRtcParticipant = {
  userId: string;
  name: string;
  image?: string;
  avatarIcon?: string;
  isHost?: boolean;
};

type ProducerInfo = {
  producerId: string;
  userId: string;
  kind: "audio" | "video";
  appData?: Record<string, unknown>;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
};

export type CohivaRtcRemoteMedia = {
  userId: string;
  name: string;
  cameraStream: MediaStream;
  screenStream: MediaStream;
};

export type CohivaRtcRoomPermissions = {
  studentMic: boolean;
  studentCamera: boolean;
  studentScreenShare: boolean;
};

export type CohivaRtcIndividualPermissions = Record<
  string,
  {
    audio?: boolean;
    video?: boolean;
    screenShare?: boolean;
  }
>;

export type CohivaRtcParticipantMediaState = {
  audio: boolean;
  video: boolean;
  screenShare: boolean;
};

export type CohivaRtcRealtimeEvent = {
  event: string;
  data: Record<string, any>;
};

type CohivaRtcEventListener = (
  data: Record<string, any>
) => void;

export type CohivaRtcModerationControl =
  | "audio"
  | "video"
  | "screenshare"
  | "kick"
  | "block";

export type CohivaRtcBulkControl =
  | "audio"
  | "video"
  | "screenshare";

type CohivaRtcContextValue = {
  callId: string;
  status: CohivaRtcStatus;
  error: string;
  notice: string;
  participants: CohivaRtcParticipant[];
  remoteMedia: Record<string, CohivaRtcRemoteMedia>;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  selectedAudioInput: string;
  selectedVideoInput: string;
  selectedAudioOutput: string;
  setSelectedAudioInput: (deviceId: string) => void;
  setSelectedVideoInput: (deviceId: string) => void;
  setSelectedAudioOutput: (deviceId: string) => void;
  selfUserId: string;
  selfRole: "host" | "participant";
  permissions: CohivaRtcRoomPermissions;
  individualPermissions: CohivaRtcIndividualPermissions;
  maxParticipants: number;
  timerEndsAt: string | null;
  recordingActive: boolean;
  recordingStartedAt: string | null;
  recordingSaving: boolean;
  recordingError: string;
  mediaStateByUser: Record<string, CohivaRtcParticipantMediaState>;
  canUseMic: boolean;
  canUseCamera: boolean;
  canShareScreen: boolean;
  refreshDevices: () => Promise<void>;
  startMicrophone: () => Promise<void>;
  stopMicrophone: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  startCamera: () => Promise<void>;
  stopCamera: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  disconnect: () => Promise<void>;
  endMeeting: () => Promise<void>;
  moderateParticipant: (
    targetUserId: string,
    control: CohivaRtcModerationControl
  ) => Promise<void>;
  muteOthers: (control: CohivaRtcBulkControl) => Promise<void>;
  updateRoomPermission: (
    field: keyof CohivaRtcRoomPermissions,
    allowed: boolean
  ) => Promise<void>;
  setIndividualPermission: (
    targetUserId: string,
    field: "audio" | "video" | "screenShare",
    allowed: boolean
  ) => Promise<void>;
  updateLimits: (
    durationMinutes: number,
    maxParticipants: number
  ) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  sendCustomEvent: (
    custom: Record<string, unknown>
  ) => Promise<void>;
  subscribeEvent: (
    event: string,
    listener: CohivaRtcEventListener
  ) => () => void;
};

const DEFAULT_ROOM_PERMISSIONS: CohivaRtcRoomPermissions = {
  studentMic: true,
  studentCamera: true,
  studentScreenShare: true,
};

const CohivaRtcContext =
  createContext<CohivaRtcContextValue | null>(null);

const safeErrorMessage = (
  error: unknown,
  fallback: string
) =>
  error instanceof Error && error.message
    ? error.message
    : fallback;

const PREJOIN_KEY_PREFIX =
  "cohiva-rtc-prejoin:";

export const CohivaRtcProvider = ({
  callId,
  children,
}: {
  callId: string;
  children: ReactNode;
}) => {
  const [status, setStatus] =
    useState<CohivaRtcStatus>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [participants, setParticipants] =
    useState<CohivaRtcParticipant[]>([]);
  const [remoteMedia, setRemoteMedia] =
    useState<Record<string, CohivaRtcRemoteMedia>>({});
  const [localCameraStream, setLocalCameraStream] =
    useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] =
    useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [audioInputs, setAudioInputs] =
    useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] =
    useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] =
    useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInputState] =
    useState("");
  const [selectedVideoInput, setSelectedVideoInputState] =
    useState("");
  const [selectedAudioOutput, setSelectedAudioOutputState] =
    useState("");
  const [selfUserId, setSelfUserId] =
    useState("");
  const [selfRole, setSelfRole] =
    useState<"host" | "participant">("participant");
  const [permissions, setPermissions] =
    useState<CohivaRtcRoomPermissions>(
      DEFAULT_ROOM_PERMISSIONS
    );
  const [individualPermissions, setIndividualPermissions] =
    useState<CohivaRtcIndividualPermissions>({});
  const [maxParticipants, setMaxParticipants] =
    useState(20);
  const [timerEndsAt, setTimerEndsAt] =
    useState<string | null>(null);
  const [recordingActive, setRecordingActive] =
    useState(false);
  const [recordingStartedAt, setRecordingStartedAt] =
    useState<string | null>(null);
  const [recordingSaving, setRecordingSaving] =
    useState(false);
  const [recordingError, setRecordingError] =
    useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const microphoneProducerRef = useRef<any>(null);
  const cameraProducerRef = useRef<any>(null);
  const screenProducerRef = useRef<any>(null);
  const pendingRef = useRef(
    new Map<string, PendingRequest>()
  );
  const consumersRef = useRef(new Map<string, any>());
  const participantNamesRef = useRef(
    new Map<string, string>()
  );
  const manualDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const desiredMicRef = useRef(false);
  const desiredCameraRef = useRef(false);
  const desiredScreenRef = useRef(false);
  const connectRef = useRef<
    (isReconnect?: boolean) => void
  >(() => {});
  const prejoinAppliedRef = useRef(false);
  const autoConnectStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const selectedAudioInputRef = useRef("");
  const selectedVideoInputRef = useRef("");
  const selectedAudioOutputRef = useRef("");
  const eventListenersRef = useRef(
    new Map<string, Set<CohivaRtcEventListener>>()
  );
  const meetingRecorderRef = useRef<CohivaBrowserMeetingRecorder | null>(null);
  const recordingFinalizePromiseRef = useRef<Promise<void> | null>(null);
  const participantsSnapshotRef = useRef(participants);
  const remoteMediaSnapshotRef = useRef(remoteMedia);
  const localCameraSnapshotRef = useRef(localCameraStream);
  const localScreenSnapshotRef = useRef(localScreenStream);

  participantsSnapshotRef.current = participants;
  remoteMediaSnapshotRef.current = remoteMedia;
  localCameraSnapshotRef.current = localCameraStream;
  localScreenSnapshotRef.current = localScreenStream;

  const subscribeEvent = useCallback(
    (
      event: string,
      listener: CohivaRtcEventListener
    ) => {
      const key = event.trim();

      if (!key) {
        return () => {};
      }

      const listeners =
        eventListenersRef.current.get(key) ??
        new Set<CohivaRtcEventListener>();

      listeners.add(listener);
      eventListenersRef.current.set(key, listeners);

      return () => {
        const current =
          eventListenersRef.current.get(key);

        if (!current) return;

        current.delete(listener);

        if (current.size === 0) {
          eventListenersRef.current.delete(key);
        }
      };
    },
    []
  );

  const emitEvent = useCallback(
    (
      event: string,
      data: Record<string, any>
    ) => {
      const listeners =
        eventListenersRef.current.get(event);

      if (!listeners) return;

      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (listenerError) {
          console.error(
            "Cohiva RTC event listener error:",
            listenerError
          );
        }
      });
    },
    []
  );

  const setSelectedAudioInput = useCallback((deviceId: string) => {
    selectedAudioInputRef.current = deviceId;
    setSelectedAudioInputState(deviceId);
  }, []);

  const setSelectedVideoInput = useCallback((deviceId: string) => {
    selectedVideoInputRef.current = deviceId;
    setSelectedVideoInputState(deviceId);
  }, []);

  const setSelectedAudioOutput = useCallback((deviceId: string) => {
    selectedAudioOutputRef.current = deviceId;
    setSelectedAudioOutputState(deviceId);
  }, []);

  const setTransientNotice = useCallback(
    (message: string) => {
      setNotice(message);
      window.setTimeout(() => {
        if (mountedRef.current) {
          setNotice((current) =>
            current === message ? "" : current
          );
        }
      }, 3500);
    },
    []
  );

  const request = useCallback(
    (
      action: string,
      data: Record<string, unknown> = {}
    ) =>
      new Promise<any>((resolve, reject) => {
        const socket = socketRef.current;

        if (
          !socket ||
          socket.readyState !== WebSocket.OPEN
        ) {
          reject(
            new Error(
              "Cohiva RTC signaling is not connected."
            )
          );
          return;
        }

        const id = crypto.randomUUID();
        pendingRef.current.set(id, {
          resolve,
          reject,
        });

        socket.send(
          JSON.stringify({
            type: "request",
            id,
            action,
            data,
          })
        );

        window.setTimeout(() => {
          const pending = pendingRef.current.get(id);
          if (!pending) return;
          pendingRef.current.delete(id);
          pending.reject(
            new Error(
              `Cohiva RTC request timed out: ${action}`
            )
          );
        }, 12_000);
      }),
    []
  );

  const sendCustomEvent = useCallback(
    async (custom: Record<string, unknown>) => {
      await request("customEvent", {
        custom,
      });
    },
    [request]
  );

  const ensureSendTransport = useCallback(async () => {
    if (sendTransportRef.current) {
      return sendTransportRef.current;
    }

    const device = deviceRef.current;
    if (!device) {
      throw new Error("Cohiva RTC device is not ready.");
    }

    const options = await request("createTransport", {});
    const transport = device.createSendTransport(options);

    transport.on(
      "connect",
      async (
        { dtlsParameters }: { dtlsParameters: unknown },
        callback: () => void,
        errback: (error: Error) => void
      ) => {
        try {
          await request("connectTransport", {
            transportId: transport.id,
            dtlsParameters,
          });
          callback();
        } catch (transportError) {
          errback(
            transportError instanceof Error
              ? transportError
              : new Error("RTC transport connect failed.")
          );
        }
      }
    );

    transport.on(
      "produce",
      async (
        {
          kind,
          rtpParameters,
          appData,
        }: {
          kind: string;
          rtpParameters: unknown;
          appData: Record<string, unknown>;
        },
        callback: (data: { id: string }) => void,
        errback: (error: Error) => void
      ) => {
        try {
          const result = await request("produce", {
            transportId: transport.id,
            kind,
            rtpParameters,
            appData,
          });

          callback({ id: result.id });
        } catch (produceError) {
          errback(
            produceError instanceof Error
              ? produceError
              : new Error("RTC media publishing failed.")
          );
        }
      }
    );

    sendTransportRef.current = transport;
    return transport;
  }, [request]);

  const ensureRecvTransport = useCallback(async () => {
    if (recvTransportRef.current) {
      return recvTransportRef.current;
    }

    const device = deviceRef.current;
    if (!device) {
      throw new Error("Cohiva RTC device is not ready.");
    }

    const options = await request("createTransport", {});
    const transport = device.createRecvTransport(options);

    transport.on(
      "connect",
      async (
        { dtlsParameters }: { dtlsParameters: unknown },
        callback: () => void,
        errback: (error: Error) => void
      ) => {
        try {
          await request("connectTransport", {
            transportId: transport.id,
            dtlsParameters,
          });
          callback();
        } catch (transportError) {
          errback(
            transportError instanceof Error
              ? transportError
              : new Error("RTC transport connect failed.")
          );
        }
      }
    );

    recvTransportRef.current = transport;
    return transport;
  }, [request]);

  const removeRemoteProducer = useCallback(
    (producerId: string) => {
      const consumer = consumersRef.current.get(producerId);
      if (!consumer) return;

      const track = consumer.track as
        | MediaStreamTrack
        | undefined;

      consumersRef.current.delete(producerId);

      try {
        consumer.close();
      } catch {}

      if (!track) return;

      setRemoteMedia((current) => {
        const next: Record<
          string,
          CohivaRtcRemoteMedia
        > = {};

        for (const [userId, media] of Object.entries(
          current
        )) {
          const cameraStream = new MediaStream(
            media.cameraStream
              .getTracks()
              .filter((item) => item.id !== track.id)
          );

          const screenStream = new MediaStream(
            media.screenStream
              .getTracks()
              .filter((item) => item.id !== track.id)
          );

          next[userId] = {
            ...media,
            cameraStream,
            screenStream,
          };
        }

        return next;
      });
    },
    []
  );

  const consumeProducer = useCallback(
    async (producerInfo: ProducerInfo) => {
      if (
        consumersRef.current.has(
          producerInfo.producerId
        )
      ) {
        return;
      }

      const device = deviceRef.current;
      if (!device) return;

      const recvTransport = await ensureRecvTransport();
      const result = await request("consume", {
        transportId: recvTransport.id,
        producerId: producerInfo.producerId,
        rtpCapabilities: device.rtpCapabilities,
      });

      const consumer = await recvTransport.consume({
        id: result.id,
        producerId: result.producerId,
        kind: result.kind,
        rtpParameters: result.rtpParameters,
      });

      consumersRef.current.set(
        producerInfo.producerId,
        consumer
      );

      const source = String(
        producerInfo.appData?.source || "camera"
      );
      const userId = producerInfo.userId;
      const name =
        participantNamesRef.current.get(userId) ||
        "Participant";

      setRemoteMedia((current) => {
        const existing = current[userId] || {
          userId,
          name,
          cameraStream: new MediaStream(),
          screenStream: new MediaStream(),
        };

        const cameraStream = new MediaStream(
          existing.cameraStream.getTracks()
        );
        const screenStream = new MediaStream(
          existing.screenStream.getTracks()
        );

        if (source === "screen") {
          screenStream.addTrack(consumer.track);
        } else {
          cameraStream.addTrack(consumer.track);
        }

        return {
          ...current,
          [userId]: {
            ...existing,
            name,
            cameraStream,
            screenStream,
          },
        };
      });

      consumer.on("transportclose", () => {
        consumersRef.current.delete(
          producerInfo.producerId
        );
      });

      consumer.on("trackended", () => {
        consumersRef.current.delete(
          producerInfo.producerId
        );
      });

      await request("resumeConsumer", {
        consumerId: consumer.id,
      });
    },
    [ensureRecvTransport, request]
  );

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices =
        await navigator.mediaDevices.enumerateDevices();

      const microphones = devices.filter(
        (device) => device.kind === "audioinput"
      );

      const cameras = devices.filter(
        (device) => device.kind === "videoinput"
      );

      const speakers = devices.filter(
        (device) => device.kind === "audiooutput"
      );

      setAudioInputs(microphones);
      setVideoInputs(cameras);
      setAudioOutputs(speakers);

      if (
        !selectedAudioInputRef.current &&
        microphones[0]?.deviceId
      ) {
        setSelectedAudioInput(microphones[0].deviceId);
      }

      if (
        !selectedVideoInputRef.current &&
        cameras[0]?.deviceId
      ) {
        setSelectedVideoInput(cameras[0].deviceId);
      }

      if (
        !selectedAudioOutputRef.current &&
        speakers[0]?.deviceId
      ) {
        setSelectedAudioOutput(speakers[0].deviceId);
      }
    } catch {
      setTransientNotice(
        "Cohiva could not list media devices."
      );
    }
  }, [
    setSelectedAudioInput,
    setSelectedAudioOutput,
    setSelectedVideoInput,
    setTransientNotice,
  ]);

  const stopMicrophone = useCallback(async () => {
    desiredMicRef.current = false;
    const producer = microphoneProducerRef.current;
    microphoneProducerRef.current = null;
    setMicOn(false);

    if (!producer) return;

    try {
      await request("closeProducer", {
        producerId: producer.id,
      });
    } catch {}

    try {
      producer.track?.stop();
      producer.close();
    } catch {}
  }, [request]);

  const stopCamera = useCallback(async () => {
    desiredCameraRef.current = false;
    const producer = cameraProducerRef.current;
    cameraProducerRef.current = null;
    setCameraOn(false);

    if (producer) {
      try {
        await request("closeProducer", {
          producerId: producer.id,
        });
      } catch {}

      try {
        producer.track?.stop();
        producer.close();
      } catch {}
    }

    setLocalCameraStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, [request]);

  const stopScreenShare = useCallback(async () => {
    desiredScreenRef.current = false;
    const producer = screenProducerRef.current;
    screenProducerRef.current = null;
    setScreenOn(false);

    if (producer) {
      try {
        await request("closeProducer", {
          producerId: producer.id,
        });
      } catch {}

      try {
        producer.track?.stop();
        producer.close();
      } catch {}
    }

    setLocalScreenStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, [request]);

  const startMicrophone = useCallback(async () => {
    const individual = individualPermissions[selfUserId] ?? {};
    const allowed =
      selfRole === "host" ||
      (permissions.studentMic !== false &&
        individual.audio !== false);

    if (!allowed) {
      desiredMicRef.current = false;
      setTransientNotice(
        "The host has disabled your microphone."
      );
      return;
    }

    desiredMicRef.current = true;
    if (microphoneProducerRef.current) return;

    let microphoneStream: MediaStream | null = null;

    try {
      microphoneStream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(selectedAudioInputRef.current || selectedAudioInput
              ? {
                  deviceId: {
                    exact:
                      selectedAudioInputRef.current ||
                      selectedAudioInput,
                  },
                }
              : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

      const track = microphoneStream.getAudioTracks()[0];
      if (!track) {
        throw new Error(
          "No microphone track was available."
        );
      }

      const transport = await ensureSendTransport();
      const producer = await transport.produce({
        track,
        appData: { source: "microphone" },
      });

      microphoneProducerRef.current = producer;
      setMicOn(true);
      await refreshDevices();

      producer.on("transportclose", () => {
        microphoneProducerRef.current = null;
        setMicOn(false);
      });
    } catch (microphoneError) {
      desiredMicRef.current = false;
      microphoneStream
        ?.getTracks()
        .forEach((track) => track.stop());
      setError(
        safeErrorMessage(
          microphoneError,
          "Unable to start microphone."
        )
      );
    }
  }, [
    ensureSendTransport,
    individualPermissions,
    permissions.studentMic,
    refreshDevices,
    selectedAudioInput,
    selfRole,
    selfUserId,
    setTransientNotice,
  ]);

  const startCamera = useCallback(async () => {
    const individual = individualPermissions[selfUserId] ?? {};
    const allowed =
      selfRole === "host" ||
      (permissions.studentCamera !== false &&
        individual.video !== false);

    if (!allowed) {
      desiredCameraRef.current = false;
      setTransientNotice(
        "The host has disabled your camera."
      );
      return;
    }

    desiredCameraRef.current = true;
    if (cameraProducerRef.current) return;

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(selectedVideoInputRef.current || selectedVideoInput
              ? {
                  deviceId: {
                    exact:
                      selectedVideoInputRef.current ||
                      selectedVideoInput,
                  },
                }
              : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        });

      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error("No camera track was available.");
      }

      setLocalCameraStream(new MediaStream([track]));

      const transport = await ensureSendTransport();
      const producer = await transport.produce({
        track,
        appData: { source: "camera" },
        encodings: [
          {
            maxBitrate: 250_000,
            scaleResolutionDownBy: 4,
          },
          {
            maxBitrate: 700_000,
            scaleResolutionDownBy: 2,
          },
          {
            maxBitrate: 1_500_000,
            scaleResolutionDownBy: 1,
          },
        ],
      });

      cameraProducerRef.current = producer;
      setCameraOn(true);
      await refreshDevices();

      producer.on("transportclose", () => {
        cameraProducerRef.current = null;
        setCameraOn(false);
      });
    } catch (cameraError) {
      desiredCameraRef.current = false;
      setLocalCameraStream((stream) => {
        stream?.getTracks().forEach((track) => track.stop());
        return null;
      });
      setError(
        safeErrorMessage(
          cameraError,
          "Unable to start camera."
        )
      );
    }
  }, [
    ensureSendTransport,
    individualPermissions,
    permissions.studentCamera,
    refreshDevices,
    selectedVideoInput,
    selfRole,
    selfUserId,
    setTransientNotice,
  ]);

  const startScreenShare = useCallback(async () => {
    const individual = individualPermissions[selfUserId] ?? {};
    const allowed =
      selfRole === "host" ||
      (permissions.studentScreenShare !== false &&
        individual.screenShare !== false);

    if (!allowed) {
      desiredScreenRef.current = false;
      setTransientNotice(
        "The host has disabled your screen sharing."
      );
      return;
    }

    desiredScreenRef.current = true;
    if (screenProducerRef.current) return;

    try {
      const stream =
        await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error(
          "No screen-share track was available."
        );
      }

      setLocalScreenStream(new MediaStream([track]));

      const transport = await ensureSendTransport();
      const producer = await transport.produce({
        track,
        appData: { source: "screen" },
        encodings: [{ maxBitrate: 2_500_000 }],
      });

      screenProducerRef.current = producer;
      setScreenOn(true);

      track.addEventListener("ended", () => {
        if (
          screenProducerRef.current?.id === producer.id
        ) {
          void stopScreenShare();
        }
      });

      producer.on("transportclose", () => {
        screenProducerRef.current = null;
        setScreenOn(false);
        setLocalScreenStream((current) => {
          current
            ?.getTracks()
            .forEach((item) => item.stop());
          return null;
        });
      });
    } catch (screenError) {
      desiredScreenRef.current = false;
      setLocalScreenStream((stream) => {
        stream?.getTracks().forEach((track) => track.stop());
        return null;
      });
      setError(
        safeErrorMessage(
          screenError,
          "Unable to share your screen."
        )
      );
    }
  }, [
    ensureSendTransport,
    individualPermissions,
    permissions.studentScreenShare,
    selfRole,
    selfUserId,
    setTransientNotice,
    stopScreenShare,
  ]);

  const toggleMicrophone = useCallback(async () => {
    setError("");
    if (micOn) {
      await stopMicrophone();
    } else {
      await startMicrophone();
    }
  }, [micOn, startMicrophone, stopMicrophone]);

  const toggleCamera = useCallback(async () => {
    setError("");
    if (cameraOn) {
      await stopCamera();
    } else {
      await startCamera();
    }
  }, [cameraOn, startCamera, stopCamera]);

  const toggleScreenShare = useCallback(async () => {
    setError("");
    if (screenOn) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [screenOn, startScreenShare, stopScreenShare]);

  const resetMediaForReconnect = useCallback(() => {
    for (const pending of pendingRef.current.values()) {
      pending.reject(
        new Error("Cohiva RTC connection was interrupted.")
      );
    }
    pendingRef.current.clear();

    for (const consumer of consumersRef.current.values()) {
      try {
        consumer.close();
      } catch {}
    }
    consumersRef.current.clear();

    try {
      microphoneProducerRef.current?.track?.stop();
      cameraProducerRef.current?.track?.stop();
      screenProducerRef.current?.track?.stop();
      microphoneProducerRef.current?.close();
      cameraProducerRef.current?.close();
      screenProducerRef.current?.close();
      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
    } catch {}

    microphoneProducerRef.current = null;
    cameraProducerRef.current = null;
    screenProducerRef.current = null;
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;

    setMicOn(false);
    setCameraOn(false);
    setScreenOn(false);

    setLocalCameraStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });

    setLocalScreenStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });

    setRemoteMedia({});
  }, []);

  const finalizeLocalRecording = useCallback(
    async (notifyRtc = true) => {
      if (recordingFinalizePromiseRef.current) {
        return recordingFinalizePromiseRef.current;
      }

      const task = (async () => {
        const recorder = meetingRecorderRef.current;

        if (!recorder) {
          if (notifyRtc && selfRole === "host") {
            await request("setRecordingState", { active: false }).catch(() => {});
          }
          setRecordingActive(false);
          setRecordingStartedAt(null);
          return;
        }

        meetingRecorderRef.current = null;
        setRecordingSaving(true);
        setRecordingError("");

        if (notifyRtc) {
          await request("setRecordingState", { active: false }).catch(() => {});
        }

        setRecordingActive(false);
        setRecordingStartedAt(null);

        try {
          const { blob, durationMs } = await recorder.stop();
          if (!blob.size) {
            throw new Error("The recording did not contain any media.");
          }

          const response = await fetch(
            `/api/recordings/upload?callId=${encodeURIComponent(callId)}`,
            {
              method: "POST",
              headers: {
                "Content-Type": blob.type || "video/webm",
                "X-Cohiva-Duration-Ms": String(durationMs),
              },
              body: blob,
            }
          );

          const result = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(result?.error || "Cohiva could not save the recording.");
          }

          setTransientNotice("Recording saved to your Cohiva recordings.");
        } catch (saveError) {
          const message = safeErrorMessage(
            saveError,
            "Cohiva could not save the recording."
          );
          setRecordingError(message);
          setTransientNotice(message);
        } finally {
          setRecordingSaving(false);
        }
      })();

      recordingFinalizePromiseRef.current = task;
      try {
        await task;
      } finally {
        recordingFinalizePromiseRef.current = null;
      }
    },
    [callId, request, selfRole, setTransientNotice]
  );

  const startRecording = useCallback(async () => {
    if (selfRole !== "host") {
      throw new Error("Only the meeting host can start a recording.");
    }
    if (status !== "joined") {
      throw new Error("Join the meeting before starting a recording.");
    }
    if (recordingSaving) {
      throw new Error("Please wait for the previous recording to finish saving.");
    }
    if (meetingRecorderRef.current?.isActive()) return;

    setRecordingError("");

    const recorder = new CohivaBrowserMeetingRecorder(() => ({
      participants: participantsSnapshotRef.current,
      selfUserId,
      localCameraStream: localCameraSnapshotRef.current,
      localScreenStream: localScreenSnapshotRef.current,
      localMicrophoneTrack:
        microphoneProducerRef.current?.track?.readyState === "live"
          ? microphoneProducerRef.current.track
          : null,
      remoteMedia: remoteMediaSnapshotRef.current,
    }));

    try {
      await recorder.start();
      meetingRecorderRef.current = recorder;

      const result = await request("setRecordingState", { active: true });
      setRecordingActive(result?.active === true);
      setRecordingStartedAt(
        typeof result?.startedAt === "string"
          ? result.startedAt
          : new Date().toISOString()
      );
      setTransientNotice("Recording started. Participants can see the recording indicator.");
    } catch (recordingStartError) {
      meetingRecorderRef.current = null;
      await recorder.stop().catch(() => null);
      const message = safeErrorMessage(
        recordingStartError,
        "Cohiva could not start recording."
      );
      setRecordingError(message);
      setTransientNotice(message);
      throw new Error(message);
    }
  }, [recordingSaving, request, selfRole, selfUserId, setTransientNotice, status]);

  const stopRecording = useCallback(async () => {
    if (selfRole !== "host") {
      throw new Error("Only the meeting host can stop a recording.");
    }
    await finalizeLocalRecording(true);
  }, [finalizeLocalRecording, selfRole]);

  const scheduleReconnect = useCallback(() => {
    if (
      manualDisconnectRef.current ||
      reconnectTimerRef.current !== null
    ) {
      return;
    }

    reconnectAttemptRef.current += 1;

    const delay = Math.min(
      8_000,
      1_000 *
        2 **
          Math.min(
            3,
            reconnectAttemptRef.current - 1
          )
    );

    setStatus("reconnecting");

    reconnectTimerRef.current = window.setTimeout(
      () => {
        reconnectTimerRef.current = null;
        connectRef.current(true);
      },
      delay
    );
  }, []);

  const disconnect = useCallback(async () => {
    manualDisconnectRef.current = true;

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    reconnectAttemptRef.current = 0;

    if (selfRole === "host" && meetingRecorderRef.current) {
      await finalizeLocalRecording(true);
    }

    await stopMicrophone();
    await stopCamera();
    await stopScreenShare();

    for (const pending of pendingRef.current.values()) {
      pending.reject(new Error("Cohiva RTC disconnected."));
    }
    pendingRef.current.clear();

    for (const consumer of consumersRef.current.values()) {
      try {
        consumer.close();
      } catch {}
    }
    consumersRef.current.clear();

    try {
      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
    } catch {}

    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;

    const socket = socketRef.current;
    socketRef.current = null;

    if (
      socket &&
      socket.readyState < WebSocket.CLOSING
    ) {
      socket.close(1000, "Cohiva RTC disconnected");
    }

    setParticipants([]);
    setRemoteMedia({});
    participantNamesRef.current.clear();
    setStatus("idle");
  }, [
    finalizeLocalRecording,
    selfRole,
    stopCamera,
    stopMicrophone,
    stopScreenShare,
  ]);

  const applyPrejoinPreferences = useCallback(
    async () => {
      if (prejoinAppliedRef.current) return;
      prejoinAppliedRef.current = true;

      try {
        const key = `${PREJOIN_KEY_PREFIX}${callId}`;
        const stored = window.sessionStorage.getItem(key);
        window.sessionStorage.removeItem(key);

        if (!stored) return;

        const value = JSON.parse(stored) as {
          microphone?: boolean;
          camera?: boolean;
          audioDeviceId?: string;
          videoDeviceId?: string;
          audioOutputDeviceId?: string;
        };

        if (value.audioDeviceId) {
          setSelectedAudioInput(value.audioDeviceId);
        }

        if (value.videoDeviceId) {
          setSelectedVideoInput(value.videoDeviceId);
        }

        if (value.audioOutputDeviceId) {
          setSelectedAudioOutput(value.audioOutputDeviceId);
        }

        if (value.microphone) {
          await startMicrophone();
        }

        if (value.camera) {
          await startCamera();
        }
      } catch {}
    },
    [
      callId,
      setSelectedAudioInput,
      setSelectedAudioOutput,
      setSelectedVideoInput,
      startCamera,
      startMicrophone,
    ]
  );

  const connect = useCallback(
    async (isReconnect = false) => {
      manualDisconnectRef.current = false;
      setError("");
      setStatus(isReconnect ? "reconnecting" : "connecting");

      try {
        const response = await fetch("/api/rtc/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ callId }),
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          token?: string;
          wsUrl?: string;
          userId?: string;
          role?: "host" | "participant";
          error?: string;
        };

        if (
          !response.ok ||
          !payload.token ||
          !payload.wsUrl
        ) {
          throw new Error(
            payload.error ||
              "Unable to prepare Cohiva RTC."
          );
        }

        if (payload.userId) {
          setSelfUserId(payload.userId);
        }
        if (payload.role) {
          setSelfRole(payload.role);
        }

        const endpoint = new URL(payload.wsUrl);
        endpoint.searchParams.set("token", payload.token);

        const socket = new WebSocket(endpoint.toString());
        socketRef.current = socket;

        socket.addEventListener(
          "message",
          async (event) => {
            let message: any;

            try {
              message = JSON.parse(String(event.data));
            } catch {
              return;
            }

            if (
              message.type === "response" &&
              message.id
            ) {
              const pending = pendingRef.current.get(
                message.id
              );
              if (!pending) return;

              pendingRef.current.delete(message.id);

              if (message.ok) {
                pending.resolve(message.data);
              } else {
                pending.reject(
                  new Error(
                    message.error ||
                      "Cohiva RTC request failed."
                  )
                );
              }
              return;
            }

            if (message.type !== "event") return;

            emitEvent(
              String(message.event || ""),
              (message.data ?? {}) as Record<string, any>
            );

            if (
              message.event === "participant-joined" &&
              message.data?.participant
            ) {
              const participant =
                message.data
                  .participant as CohivaRtcParticipant;

              participantNamesRef.current.set(
                participant.userId,
                participant.name
              );

              setParticipants((current) => {
                const without = current.filter(
                  (item) =>
                    item.userId !== participant.userId
                );
                return [...without, participant];
              });
              return;
            }

            if (
              message.event === "participant-left" &&
              message.data?.userId
            ) {
              const userId = String(message.data.userId);

              setParticipants((current) =>
                current.filter(
                  (item) => item.userId !== userId
                )
              );

              setRemoteMedia((current) => {
                const next = { ...current };
                delete next[userId];
                return next;
              });

              participantNamesRef.current.delete(userId);
              return;
            }

            if (message.event === "producer-added") {
              try {
                await consumeProducer(
                  message.data as ProducerInfo
                );
              } catch (consumeError) {
                setTransientNotice(
                  safeErrorMessage(
                    consumeError,
                    "Unable to receive participant media."
                  )
                );
              }
              return;
            }

            if (
              message.event === "producer-removed" &&
              message.data?.producerId
            ) {
              removeRemoteProducer(
                String(message.data.producerId)
              );
              return;
            }

            if (
              message.event === "consumer-closed" &&
              message.data?.producerId
            ) {
              removeRemoteProducer(
                String(message.data.producerId)
              );
              return;
            }

            if (message.event === "cohiva.media-disabled") {
              const control = String(
                message.data?.control || ""
              );

              if (control === "audio") {
                await stopMicrophone();
              }
              if (control === "video") {
                await stopCamera();
              }
              if (control === "screenshare") {
                await stopScreenShare();
              }

              setTransientNotice(
                `The host disabled your ${control}.`
              );
              return;
            }

            if (
              message.event ===
              "cohiva.permissions-updated"
            ) {
              if (message.data?.permissions) {
                setPermissions((current) => ({
                  ...current,
                  ...message.data.permissions,
                }));
              }

              if (message.data?.individualPermissions) {
                setIndividualPermissions(
                  message.data.individualPermissions
                );
              }
              return;
            }

            if (
              message.event === "cohiva.limits-updated"
            ) {
              if (
                Number.isFinite(
                  Number(message.data?.maxParticipants)
                )
              ) {
                setMaxParticipants(
                  Number(message.data.maxParticipants)
                );
              }

              if (
                typeof message.data?.timerEndsAt ===
                "string"
              ) {
                setTimerEndsAt(message.data.timerEndsAt);
              }
              return;
            }

            if (message.event === "cohiva.recording-state") {
              setRecordingActive(message.data?.active === true);
              setRecordingStartedAt(
                typeof message.data?.startedAt === "string"
                  ? message.data.startedAt
                  : null
              );
              return;
            }

            if (message.event === "cohiva.kicked") {
              manualDisconnectRef.current = true;
              setError(
                message.data?.blocked
                  ? "You were blocked from this meeting by the host."
                  : "You were removed from this meeting by the host."
              );
              setStatus("error");
              socket.close(4001, "Removed by host");
              return;
            }

            if (message.event === "call.ended") {
              manualDisconnectRef.current = true;
              if (meetingRecorderRef.current) {
                void finalizeLocalRecording(false);
              }
              setStatus("ended");
              socket.close(4000, "Meeting ended");
              return;
            }
          }
        );

        socket.addEventListener("open", async () => {
          try {
            const joined = await request("join", {});

            const nextParticipants = Array.isArray(
              joined.participants
            )
              ? (joined.participants as CohivaRtcParticipant[])
              : [];

            participantNamesRef.current.clear();
            nextParticipants.forEach((participant) =>
              participantNamesRef.current.set(
                participant.userId,
                participant.name
              )
            );

            setParticipants(nextParticipants);

            if (
              joined.selfRole === "host" ||
              joined.selfRole === "participant"
            ) {
              setSelfRole(joined.selfRole);
            }

            if (joined.permissions) {
              setPermissions((current) => ({
                ...current,
                ...joined.permissions,
              }));
            }

            if (joined.individualPermissions) {
              setIndividualPermissions(
                joined.individualPermissions
              );
            }

            if (
              Number.isFinite(
                Number(joined.maxParticipants)
              )
            ) {
              setMaxParticipants(
                Number(joined.maxParticipants)
              );
            }

            setTimerEndsAt(
              typeof joined.timerEndsAt === "string"
                ? joined.timerEndsAt
                : null
            );
            setRecordingActive(joined.recordingActive === true);
            setRecordingStartedAt(
              typeof joined.recordingStartedAt === "string"
                ? joined.recordingStartedAt
                : null
            );

            const device = new Device();
            await device.load({
              routerRtpCapabilities:
                joined.routerRtpCapabilities,
            });
            deviceRef.current = device;

            await refreshDevices();
            await ensureRecvTransport();

            const existingProducers = Array.isArray(
              joined.producers
            )
              ? (joined.producers as ProducerInfo[])
              : [];

            for (const producerInfo of existingProducers) {
              try {
                await consumeProducer(producerInfo);
              } catch {}
            }

            setStatus("joined");
            reconnectAttemptRef.current = 0;

            if (isReconnect) {
              if (desiredMicRef.current) {
                await startMicrophone();
              }
              if (desiredCameraRef.current) {
                await startCamera();
              }
              if (desiredScreenRef.current) {
                desiredScreenRef.current = false;
                setTransientNotice(
                  "Screen sharing must be started again after reconnecting."
                );
              }
            } else {
              await applyPrejoinPreferences();
            }
          } catch (joinError) {
            setError(
              safeErrorMessage(
                joinError,
                "Unable to join Cohiva RTC."
              )
            );
            setStatus("error");
          }
        });

        socket.addEventListener("error", () => {
          setError((current) =>
            current || "Cohiva RTC connection error."
          );
        });

        socket.addEventListener("close", (event) => {
          if (socketRef.current === socket) {
            socketRef.current = null;
          }

          if (
            manualDisconnectRef.current ||
            event.code === 4000 ||
            event.code === 4001
          ) {
            return;
          }

          resetMediaForReconnect();
          scheduleReconnect();
        });
      } catch (connectError) {
        setError(
          safeErrorMessage(
            connectError,
            "Cohiva RTC connection failed."
          )
        );

        if (
          isReconnect &&
          !manualDisconnectRef.current
        ) {
          scheduleReconnect();
        } else {
          setStatus("error");
        }
      }
    },
    [
      applyPrejoinPreferences,
      callId,
      consumeProducer,
      finalizeLocalRecording,
      ensureRecvTransport,
      emitEvent,
      refreshDevices,
      removeRemoteProducer,
      request,
      resetMediaForReconnect,
      scheduleReconnect,
      setTransientNotice,
      startCamera,
      startMicrophone,
      stopCamera,
      stopMicrophone,
      stopRecording,
      stopScreenShare,
    ]
  );

  useEffect(() => {
    connectRef.current = (isReconnect = false) => {
      void connect(isReconnect);
    };
  }, [connect]);

  useEffect(() => {
    if (autoConnectStartedRef.current) return;
    autoConnectStartedRef.current = true;
    void connect(false);
  }, [connect]);

  useEffect(() => {
    const onOffline = () => {
      if (status === "joined") {
        setStatus("reconnecting");
      }
    };

    const onOnline = () => {
      if (manualDisconnectRef.current) return;

      const socket = socketRef.current;
      if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        if (reconnectTimerRef.current !== null) {
          window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        connectRef.current(true);
      }
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [status]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      manualDisconnectRef.current = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      const socket = socketRef.current;
      socketRef.current = null;

      try {
        socket?.close();
      } catch {}

      try {
        microphoneProducerRef.current?.track?.stop();
        cameraProducerRef.current?.track?.stop();
        screenProducerRef.current?.track?.stop();
        sendTransportRef.current?.close();
        recvTransportRef.current?.close();
      } catch {}

      for (const consumer of consumersRef.current.values()) {
        try {
          consumer.close();
        } catch {}
      }
    };
  }, []);

  const moderateParticipant = useCallback(
    async (
      targetUserId: string,
      control: CohivaRtcModerationControl
    ) => {
      await request("moderate", {
        targetUserId,
        control,
      });
    },
    [request]
  );

  const muteOthers = useCallback(
    async (control: CohivaRtcBulkControl) => {
      await request("muteOthers", { control });
    },
    [request]
  );

  const updateRoomPermission = useCallback(
    async (
      field: keyof CohivaRtcRoomPermissions,
      allowed: boolean
    ) => {
      const result = await request("setRoomPermission", {
        field,
        allowed,
      });

      if (result?.permissions) {
        setPermissions(result.permissions);
      }

      if (result?.individualPermissions) {
        setIndividualPermissions(
          result.individualPermissions
        );
      }
    },
    [request]
  );

  const setIndividualPermission = useCallback(
    async (
      targetUserId: string,
      field: "audio" | "video" | "screenShare",
      allowed: boolean
    ) => {
      const result = await request(
        "setIndividualPermission",
        {
          targetUserId,
          field,
          allowed,
        }
      );

      if (result?.permissions) {
        setPermissions(result.permissions);
      }

      if (result?.individualPermissions) {
        setIndividualPermissions(
          result.individualPermissions
        );
      }
    },
    [request]
  );

  const updateLimits = useCallback(
    async (
      durationMinutes: number,
      nextMaxParticipants: number
    ) => {
      const result = await request("setLimits", {
        durationMinutes,
        maxParticipants: nextMaxParticipants,
      });

      if (
        Number.isFinite(
          Number(result?.maxParticipants)
        )
      ) {
        setMaxParticipants(
          Number(result.maxParticipants)
        );
      }

      if (
        typeof result?.timerEndsAt === "string" ||
        result?.timerEndsAt === null
      ) {
        setTimerEndsAt(result.timerEndsAt ?? null);
      }
    },
    [request]
  );

  const endMeeting = useCallback(async () => {
    if (selfRole === "host" && meetingRecorderRef.current) {
      await finalizeLocalRecording(true);
    }
    await request("endMeeting", {});
  }, [finalizeLocalRecording, request, selfRole]);

  useEffect(() => {
    if (!recordingActive || selfRole !== "host" || !meetingRecorderRef.current) {
      return;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [recordingActive, selfRole]);

  const selfIndividual =
    individualPermissions[selfUserId] ?? {};

  const canUseMic =
    selfRole === "host" ||
    (permissions.studentMic !== false &&
      selfIndividual.audio !== false);

  const canUseCamera =
    selfRole === "host" ||
    (permissions.studentCamera !== false &&
      selfIndividual.video !== false);

  const canShareScreen =
    selfRole === "host" ||
    (permissions.studentScreenShare !== false &&
      selfIndividual.screenShare !== false);

  const mediaStateByUser = useMemo(() => {
    const next: Record<
      string,
      CohivaRtcParticipantMediaState
    > = {};

    participants.forEach((participant) => {
      next[participant.userId] = {
        audio: false,
        video: false,
        screenShare: false,
      };
    });

    if (selfUserId) {
      next[selfUserId] = {
        audio: micOn,
        video: cameraOn,
        screenShare: screenOn,
      };
    }

    Object.entries(remoteMedia).forEach(
      ([userId, media]) => {
        next[userId] = {
          audio:
            media.cameraStream.getAudioTracks().length > 0,
          video:
            media.cameraStream.getVideoTracks().length > 0,
          screenShare:
            media.screenStream.getVideoTracks().length > 0,
        };
      }
    );

    return next;
  }, [
    cameraOn,
    micOn,
    participants,
    remoteMedia,
    screenOn,
    selfUserId,
  ]);

  const value = useMemo<CohivaRtcContextValue>(
    () => ({
      callId,
      status,
      error,
      notice,
      participants,
      remoteMedia,
      localCameraStream,
      localScreenStream,
      micOn,
      cameraOn,
      screenOn,
      audioInputs,
      videoInputs,
      audioOutputs,
      selectedAudioInput,
      selectedVideoInput,
      selectedAudioOutput,
      setSelectedAudioInput,
      setSelectedVideoInput,
      setSelectedAudioOutput,
      selfUserId,
      selfRole,
      permissions,
      individualPermissions,
      maxParticipants,
      timerEndsAt,
      recordingActive,
      recordingStartedAt,
      recordingSaving,
      recordingError,
      mediaStateByUser,
      canUseMic,
      canUseCamera,
      canShareScreen,
      refreshDevices,
      startMicrophone,
      stopMicrophone,
      toggleMicrophone,
      startCamera,
      stopCamera,
      toggleCamera,
      startScreenShare,
      stopScreenShare,
      toggleScreenShare,
      disconnect,
      endMeeting,
      moderateParticipant,
      muteOthers,
      updateRoomPermission,
      setIndividualPermission,
      updateLimits,
      startRecording,
      stopRecording,
      sendCustomEvent,
      subscribeEvent,
    }),
    [
      audioInputs,
      audioOutputs,
      callId,
      cameraOn,
      canShareScreen,
      canUseCamera,
      canUseMic,
      disconnect,
      endMeeting,
      error,
      individualPermissions,
      localCameraStream,
      localScreenStream,
      maxParticipants,
      mediaStateByUser,
      micOn,
      recordingActive,
      recordingError,
      recordingSaving,
      recordingStartedAt,
      moderateParticipant,
      muteOthers,
      notice,
      participants,
      permissions,
      refreshDevices,
      remoteMedia,
      screenOn,
      selectedAudioInput,
      selectedAudioOutput,
      selectedVideoInput,
      selfRole,
      selfUserId,
      setIndividualPermission,
      setSelectedAudioInput,
      setSelectedAudioOutput,
      setSelectedVideoInput,
      startCamera,
      startMicrophone,
      startRecording,
      startScreenShare,
      status,
      stopCamera,
      stopMicrophone,
      stopRecording,
      stopScreenShare,
      timerEndsAt,
      toggleCamera,
      toggleMicrophone,
      toggleScreenShare,
      updateLimits,
      updateRoomPermission,
      sendCustomEvent,
      subscribeEvent,
      videoInputs,
    ]
  );

  return (
    <CohivaRtcContext.Provider value={value}>
      {children}
    </CohivaRtcContext.Provider>
  );
};

export const useCohivaRtc = () => {
  const value = useContext(CohivaRtcContext);

  if (!value) {
    throw new Error(
      "useCohivaRtc must be used inside CohivaRtcProvider."
    );
  }

  return value;
};

export const useOptionalCohivaRtc = () =>
  useContext(CohivaRtcContext);
