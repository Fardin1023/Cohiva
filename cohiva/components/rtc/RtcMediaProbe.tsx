"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Device } from "mediasoup-client";

type JoinParticipant = {
  userId: string;
  name: string;
  image?: string;
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

type RemoteMedia = {
  userId: string;
  name: string;
  cameraStream: MediaStream;
  screenStream: MediaStream;
};

type LogLine = {
  at: string;
  text: string;
};

const stamp = () => new Date().toLocaleTimeString();

function AudioView({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const audioOnly = stream
      ? new MediaStream(stream.getAudioTracks())
      : null;
    ref.current.srcObject = audioOnly;
  }, [stream]);

  return <audio ref={ref} autoPlay playsInline />;
}

function MediaView({
  stream,
  muted = false,
  className = "",
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
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
}

export default function RtcMediaProbe() {
  const [roomId, setRoomId] = useState("cohiva-rtc-test");
  const [status, setStatus] = useState<
    "idle" | "connecting" | "joined" | "error"
  >("idle");
  const [participants, setParticipants] = useState<JoinParticipant[]>([]);
  const [remoteMedia, setRemoteMedia] = useState<Record<string, RemoteMedia>>({});
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [selectedVideoInput, setSelectedVideoInput] = useState("");
  const [logs, setLogs] = useState<LogLine[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const microphoneProducerRef = useRef<any>(null);
  const cameraProducerRef = useRef<any>(null);
  const screenProducerRef = useRef<any>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const consumersRef = useRef(new Map<string, any>());
  const participantNamesRef = useRef(new Map<string, string>());

  const addLog = useCallback((text: string) => {
    setLogs((current) => [...current.slice(-29), { at: stamp(), text }]);
  }, []);

  const request = useCallback(
    (action: string, data: Record<string, unknown> = {}) => {
      return new Promise<any>((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          reject(new Error("RTC signaling is not connected."));
          return;
        }

        const id = crypto.randomUUID();
        pendingRef.current.set(id, { resolve, reject });

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
          pending.reject(new Error(`RTC request timed out: ${action}`));
        }, 12_000);
      });
    },
    []
  );

  const ensureSendTransport = useCallback(async () => {
    if (sendTransportRef.current) return sendTransportRef.current;

    const device = deviceRef.current;
    if (!device) throw new Error("RTC device is not ready.");

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
        } catch (error) {
          errback(error instanceof Error ? error : new Error("Transport connect failed."));
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
        } catch (error) {
          errback(error instanceof Error ? error : new Error("Produce failed."));
        }
      }
    );

    sendTransportRef.current = transport;
    return transport;
  }, [request]);

  const ensureRecvTransport = useCallback(async () => {
    if (recvTransportRef.current) return recvTransportRef.current;

    const device = deviceRef.current;
    if (!device) throw new Error("RTC device is not ready.");

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
        } catch (error) {
          errback(error instanceof Error ? error : new Error("Transport connect failed."));
        }
      }
    );

    recvTransportRef.current = transport;
    return transport;
  }, [request]);

  const consumeProducer = useCallback(
    async (producerInfo: ProducerInfo) => {
      if (consumersRef.current.has(producerInfo.producerId)) return;

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

      consumersRef.current.set(producerInfo.producerId, consumer);

      const source = String(producerInfo.appData?.source || "camera");
      const userId = producerInfo.userId;
      const name = participantNamesRef.current.get(userId) || "Participant";

      setRemoteMedia((current) => {
        const existing = current[userId] || {
          userId,
          name,
          cameraStream: new MediaStream(),
          screenStream: new MediaStream(),
        };

        const cameraStream = new MediaStream(existing.cameraStream.getTracks());
        const screenStream = new MediaStream(existing.screenStream.getTracks());

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
        consumersRef.current.delete(producerInfo.producerId);
      });

      consumer.on("trackended", () => {
        consumersRef.current.delete(producerInfo.producerId);
      });

      await request("resumeConsumer", { consumerId: consumer.id });
      addLog(`Receiving ${source} ${producerInfo.kind} from ${name}.`);
    },
    [addLog, ensureRecvTransport, request]
  );

  const removeRemoteProducer = useCallback((producerId: string) => {
    const consumer = consumersRef.current.get(producerId);
    if (!consumer) return;

    const track = consumer.track as MediaStreamTrack | undefined;
    consumersRef.current.delete(producerId);

    try {
      consumer.close();
    } catch {}

    if (!track) return;

    setRemoteMedia((current) => {
      const next: Record<string, RemoteMedia> = {};

      for (const [userId, media] of Object.entries(current) as [string, RemoteMedia][]) {
        const cameraStream = new MediaStream(
          media.cameraStream.getTracks().filter((item) => item.id !== track.id)
        );
        const screenStream = new MediaStream(
          media.screenStream.getTracks().filter((item) => item.id !== track.id)
        );

        next[userId] = {
          ...media,
          cameraStream,
          screenStream,
        };
      }

      return next;
    });
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter((device) => device.kind === "audioinput");
      const cameras = devices.filter((device) => device.kind === "videoinput");

      setAudioInputs(microphones);
      setVideoInputs(cameras);
      setSelectedAudioInput((current) => current || microphones[0]?.deviceId || "");
      setSelectedVideoInput((current) => current || cameras[0]?.deviceId || "");
    } catch {
      addLog("Unable to enumerate media devices.");
    }
  }, [addLog]);

  const stopMicrophone = useCallback(async () => {
    const producer = microphoneProducerRef.current;
    microphoneProducerRef.current = null;
    setMicOn(false);

    if (!producer) return;

    try {
      await request("closeProducer", { producerId: producer.id });
    } catch {}

    try {
      producer.track?.stop();
      producer.close();
    } catch {}

    addLog("Microphone stopped.");
  }, [addLog, request]);

  const stopCamera = useCallback(async () => {
    const producer = cameraProducerRef.current;
    cameraProducerRef.current = null;
    setCameraOn(false);

    if (producer) {
      try {
        await request("closeProducer", { producerId: producer.id });
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

    addLog("Camera stopped.");
  }, [addLog, request]);

  const stopScreenShare = useCallback(async () => {
    const producer = screenProducerRef.current;
    screenProducerRef.current = null;
    setScreenOn(false);

    if (producer) {
      try {
        await request("closeProducer", { producerId: producer.id });
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

    addLog("Screen sharing stopped.");
  }, [addLog, request]);

  const startMicrophone = useCallback(async () => {
    if (microphoneProducerRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(selectedAudioInput
            ? { deviceId: { exact: selectedAudioInput } }
            : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("No microphone track was available.");

      const transport = await ensureSendTransport();
      const producer = await transport.produce({
        track,
        appData: { source: "microphone" },
      });

      microphoneProducerRef.current = producer;
      setMicOn(true);
      await refreshDevices();
      addLog("Microphone is live through Cohiva RTC.");

      producer.on("transportclose", () => {
        microphoneProducerRef.current = null;
        setMicOn(false);
      });
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Unable to start microphone.");
    }
  }, [addLog, ensureSendTransport, refreshDevices, selectedAudioInput]);

  const startCamera = useCallback(async () => {
    if (cameraProducerRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(selectedVideoInput
            ? { deviceId: { exact: selectedVideoInput } }
            : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });

      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("No camera track was available.");

      setLocalCameraStream(new MediaStream([track]));

      const transport = await ensureSendTransport();
      const producer = await transport.produce({
        track,
        appData: { source: "camera" },
        encodings: [
          { maxBitrate: 250_000, scaleResolutionDownBy: 4 },
          { maxBitrate: 700_000, scaleResolutionDownBy: 2 },
          { maxBitrate: 1_500_000, scaleResolutionDownBy: 1 },
        ],
      });

      cameraProducerRef.current = producer;
      setCameraOn(true);
      await refreshDevices();
      addLog("Camera is live through Cohiva RTC.");

      producer.on("transportclose", () => {
        cameraProducerRef.current = null;
        setCameraOn(false);
      });
    } catch (error) {
      setLocalCameraStream((stream) => {
        stream?.getTracks().forEach((track) => track.stop());
        return null;
      });
      addLog(error instanceof Error ? error.message : "Unable to start camera.");
    }
  }, [addLog, ensureSendTransport, refreshDevices, selectedVideoInput]);

  const startScreenShare = useCallback(async () => {
    if (screenProducerRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("No screen-share track was available.");

      setLocalScreenStream(new MediaStream([track]));

      const transport = await ensureSendTransport();
      const producer = await transport.produce({
        track,
        appData: { source: "screen" },
        encodings: [{ maxBitrate: 2_500_000 }],
      });

      screenProducerRef.current = producer;
      setScreenOn(true);
      addLog("Screen sharing is live through Cohiva RTC.");

      track.addEventListener("ended", () => {
        if (screenProducerRef.current?.id === producer.id) {
          void stopScreenShare();
        }
      });

      producer.on("transportclose", () => {
        screenProducerRef.current = null;
        setScreenOn(false);
        setLocalScreenStream((current) => {
          current?.getTracks().forEach((item) => item.stop());
          return null;
        });
      });
    } catch (error) {
      setLocalScreenStream((stream) => {
        stream?.getTracks().forEach((track) => track.stop());
        return null;
      });
      addLog(error instanceof Error ? error.message : "Unable to share screen.");
    }
  }, [addLog, ensureSendTransport, stopScreenShare]);

  const disconnect = useCallback(async () => {
    await stopMicrophone();
    await stopCamera();
    await stopScreenShare();

    for (const pending of pendingRef.current.values()) {
      pending.reject(new Error("RTC disconnected."));
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
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "RTC media probe disconnected");
    }

    setParticipants([]);
    setRemoteMedia({});
    participantNamesRef.current.clear();
    setStatus("idle");
  }, [stopCamera, stopMicrophone, stopScreenShare]);

  useEffect(() => {
    return () => {
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

  const connect = useCallback(async () => {
    if (status === "connecting" || status === "joined") return;

    const cleanRoomId = roomId.trim();
    if (!cleanRoomId) return;

    setStatus("connecting");
    setParticipants([]);
    setRemoteMedia({});
    setLogs([]);
    addLog("Requesting a Cohiva RTC token...");

    try {
      const response = await fetch("/api/rtc/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: cleanRoomId }),
      });

      const payload = (await response.json()) as {
        token?: string;
        wsUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.token || !payload.wsUrl) {
        throw new Error(payload.error || "Unable to create an RTC token.");
      }

      const endpoint = new URL(payload.wsUrl);
      endpoint.searchParams.set("token", payload.token);

      const socket = new WebSocket(endpoint.toString());
      socketRef.current = socket;

      socket.addEventListener("message", async (event) => {
        let message: any;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (message.type === "response" && message.id) {
          const pending = pendingRef.current.get(message.id);
          if (!pending) return;
          pendingRef.current.delete(message.id);
          if (message.ok) pending.resolve(message.data);
          else pending.reject(new Error(message.error || "RTC request failed."));
          return;
        }

        if (message.type !== "event") return;

        if (message.event === "participant-joined" && message.data?.participant) {
          const participant = message.data.participant as JoinParticipant;
          participantNamesRef.current.set(participant.userId, participant.name);
          setParticipants((current) => {
            const without = current.filter((item) => item.userId !== participant.userId);
            return [...without, participant];
          });
          addLog(`${participant.name} joined Cohiva RTC.`);
          return;
        }

        if (message.event === "participant-left" && message.data?.userId) {
          const userId = String(message.data.userId);
          setParticipants((current) => current.filter((item) => item.userId !== userId));
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
            await consumeProducer(message.data as ProducerInfo);
          } catch (error) {
            addLog(error instanceof Error ? error.message : "Unable to consume media.");
          }
          return;
        }

        if (message.event === "producer-removed" && message.data?.producerId) {
          removeRemoteProducer(String(message.data.producerId));
          return;
        }

        if (message.event === "consumer-closed" && message.data?.producerId) {
          removeRemoteProducer(String(message.data.producerId));
          return;
        }

        if (message.event === "cohiva.media-disabled") {
          const control = String(message.data?.control || "");
          if (control === "audio") await stopMicrophone();
          if (control === "video") await stopCamera();
          if (control === "screenshare") await stopScreenShare();
          return;
        }

        addLog(`Event: ${String(message.event)}`);
      });

      socket.addEventListener("open", async () => {
        try {
          addLog("Signaling connected. Joining room...");
          const joined = await request("join", {});

          const nextParticipants = Array.isArray(joined.participants)
            ? (joined.participants as JoinParticipant[])
            : [];

          participantNamesRef.current.clear();
          nextParticipants.forEach((participant) =>
            participantNamesRef.current.set(participant.userId, participant.name)
          );
          setParticipants(nextParticipants);

          const device = new Device();
          await device.load({ routerRtpCapabilities: joined.routerRtpCapabilities });
          deviceRef.current = device;
          await refreshDevices();

          await ensureRecvTransport();

          const existingProducers = Array.isArray(joined.producers)
            ? (joined.producers as ProducerInfo[])
            : [];

          for (const producerInfo of existingProducers) {
            try {
              await consumeProducer(producerInfo);
            } catch (error) {
              addLog(
                error instanceof Error
                  ? error.message
                  : "Unable to consume existing media."
              );
            }
          }

          setStatus("joined");
          addLog(`Joined. ${nextParticipants.length} RTC participant(s).`);
        } catch (error) {
          setStatus("error");
          addLog(error instanceof Error ? error.message : "Unable to join RTC room.");
        }
      });

      socket.addEventListener("error", () => {
        setStatus("error");
        addLog("WebSocket connection error.");
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current === socket) socketRef.current = null;
        setStatus((current) => (current === "error" ? current : "idle"));
        addLog(`RTC socket closed (${event.code}).`);
      });
    } catch (error) {
      setStatus("error");
      addLog(error instanceof Error ? error.message : "RTC connection failed.");
    }
  }, [
    addLog,
    consumeProducer,
    ensureRecvTransport,
    removeRemoteProducer,
    refreshDevices,
    request,
    roomId,
    status,
    stopCamera,
    stopMicrophone,
    stopScreenShare,
  ]);

  const remoteTiles = useMemo(
    () =>
      (Object.values(remoteMedia) as RemoteMedia[]).filter(
        (media) =>
          media.cameraStream.getTracks().length > 0 ||
          media.screenStream.getTracks().length > 0
      ),
    [remoteMedia]
  );

  return (
    <main className="mx-auto flex min-h-[calc(100vh-90px)] w-full max-w-6xl flex-col gap-6 px-4 py-8 text-[#3B3732] sm:px-6">
      <section className="rounded-[28px] border border-[#3B3732]/10 bg-[#FFF9EF] p-6 shadow-xl sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A2AB73]">
          Phase 4 · Stream still untouched
        </p>
        <h1 className="mt-2 text-3xl font-black">Cohiva RTC media test</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#6E655B]">
          Camera, microphone, screen sharing, and device selection on this page use your
          own mediasoup server, not GetStream. Normal meeting pages still use Stream.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            disabled={status === "connecting" || status === "joined"}
            className="h-12 flex-1 rounded-2xl border border-[#3B3732]/15 bg-white px-4 outline-none transition focus:border-[#CF3864] focus:ring-4 focus:ring-[#CF3864]/10"
            placeholder="Test room id"
          />

          {status === "joined" ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              className="h-12 rounded-2xl bg-[#3B3732] px-6 font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={status === "connecting"}
              className="h-12 rounded-2xl bg-[#CF3864] px-6 font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60"
            >
              {status === "connecting" ? "Connecting..." : "Connect RTC"}
            </button>
          )}
        </div>

        {status === "joined" && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Microphone
              <select
                value={selectedAudioInput}
                onChange={(event) => setSelectedAudioInput(event.target.value)}
                disabled={micOn}
                className="mt-2 h-11 w-full rounded-xl border border-[#3B3732]/15 bg-white px-3 text-sm outline-none disabled:opacity-60"
              >
                {audioInputs.length === 0 && <option value="">Default microphone</option>}
                {audioInputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold">
              Camera
              <select
                value={selectedVideoInput}
                onChange={(event) => setSelectedVideoInput(event.target.value)}
                disabled={cameraOn}
                className="mt-2 h-11 w-full rounded-xl border border-[#3B3732]/15 bg-white px-3 text-sm outline-none disabled:opacity-60"
              >
                {videoInputs.length === 0 && <option value="">Default camera</option>}
                {videoInputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span
            className={`h-3 w-3 rounded-full ${
              status === "joined"
                ? "bg-emerald-500"
                : status === "error"
                  ? "bg-red-500"
                  : status === "connecting"
                    ? "animate-pulse bg-amber-500"
                    : "bg-[#B7AEA4]"
            }`}
          />
          <span className="text-sm font-bold">
            {status === "joined"
              ? "Cohiva RTC media ready"
              : status === "error"
                ? "RTC test encountered an error"
                : status === "connecting"
                  ? "Connecting to Cohiva RTC..."
                  : "Not connected"}
          </span>

          {status === "joined" && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void (micOn ? stopMicrophone() : startMicrophone())}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  micOn
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#EFE7DB] text-[#3B3732]"
                }`}
              >
                {micOn ? "Stop microphone" : "Start microphone"}
              </button>

              <button
                type="button"
                onClick={() => void (cameraOn ? stopCamera() : startCamera())}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  cameraOn
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#EFE7DB] text-[#3B3732]"
                }`}
              >
                {cameraOn ? "Stop camera" : "Start camera"}
              </button>

              <button
                type="button"
                onClick={() => void (screenOn ? stopScreenShare() : startScreenShare())}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  screenOn
                    ? "bg-sky-100 text-sky-800"
                    : "bg-[#EFE7DB] text-[#3B3732]"
                }`}
              >
                {screenOn ? "Stop sharing" : "Share screen"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="overflow-hidden rounded-[24px] bg-[#292522] shadow-sm">
          <div className="aspect-video bg-black">
            {localCameraStream ? (
              <MediaView
                stream={localCameraStream}
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-bold text-white/50">
                Your camera is off
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="font-bold">You</span>
            <span className="text-xs text-white/60">
              {micOn ? "Mic on" : "Mic off"} · {cameraOn ? "Camera on" : "Camera off"} · {screenOn ? "Sharing" : "Not sharing"}
            </span>
          </div>
        </div>

        {localScreenStream && (
          <div className="overflow-hidden rounded-[24px] bg-[#292522] shadow-sm sm:col-span-2">
            <div className="aspect-video bg-black">
              <MediaView
                stream={localScreenStream}
                muted
                className="h-full w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <span className="font-bold">Your screen</span>
              <span className="text-xs text-white/60">Live through Cohiva RTC</span>
            </div>
          </div>
        )}

        {remoteTiles.map((media) => (
          <div
            key={media.userId}
            className="overflow-hidden rounded-[24px] bg-[#292522] shadow-sm"
          >
            <div className="aspect-video bg-black">
              {media.cameraStream.getVideoTracks().length > 0 ? (
                <MediaView
                  stream={new MediaStream(media.cameraStream.getVideoTracks())}
                  muted
                  className="h-full w-full object-cover"
                />
              ) : (
                <>
                  <div className="flex h-full items-center justify-center text-sm font-bold text-white/50">
                    {media.name}&apos;s camera is off
                  </div>
                </>
              )}
            </div>
            <AudioView stream={media.cameraStream} />
            <div className="px-4 py-3 text-white">
              <span className="font-bold">{media.name}</span>
            </div>

            {media.screenStream.getVideoTracks().length > 0 && (
              <div className="border-t border-white/10 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">
                  Screen share
                </p>
                <MediaView
                  stream={media.screenStream}
                  className="aspect-video w-full rounded-xl bg-black object-contain"
                />
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[24px] border border-[#3B3732]/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">RTC participants</h2>
          <div className="mt-4 space-y-2">
            {participants.length ? (
              participants.map((participant) => (
                <div key={participant.userId} className="rounded-2xl bg-[#F7F0E5] px-4 py-3">
                  <p className="font-bold">{participant.name}</p>
                  <p className="truncate text-xs text-[#7A7067]">{participant.userId}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#7A7067]">No RTC participants yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#3B3732]/10 bg-[#292522] p-5 text-white shadow-sm">
          <h2 className="text-lg font-black">RTC log</h2>
          <div className="mt-4 min-h-40 space-y-2 font-mono text-xs text-white/80">
            {logs.length ? (
              logs.map((line, index) => (
                <p key={`${line.at}-${index}`}>
                  <span className="text-white/40">[{line.at}]</span> {line.text}
                </p>
              ))
            ) : (
              <p className="text-white/40">Waiting for a test...</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
