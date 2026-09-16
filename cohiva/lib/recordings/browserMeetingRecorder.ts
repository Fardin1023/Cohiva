"use client";

export type RecorderParticipant = {
  userId: string;
  name: string;
  isHost?: boolean;
};

export type RecorderRemoteMedia = Record<
  string,
  {
    cameraStream: MediaStream;
    screenStream: MediaStream;
  }
>;

export type MeetingRecorderSnapshot = {
  participants: RecorderParticipant[];
  selfUserId: string;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  localMicrophoneTrack: MediaStreamTrack | null;
  remoteMedia: RecorderRemoteMedia;
};

type VideoEntry = {
  element: HTMLVideoElement;
  trackId: string;
};

type AudioEntry = {
  node: MediaStreamAudioSourceNode;
  stream: MediaStream;
};

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;

const chooseMimeType = () => {
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];

  return (
    candidates.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate)
    ) || ""
  );
};

const initials = (name: string) => {
  const pieces = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return pieces.map((piece) => piece[0]?.toUpperCase()).join("") || "C";
};

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
};

export class CohivaBrowserMeetingRecorder {
  private readonly getSnapshot: () => MeetingRecorderSnapshot;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private canvasStream: MediaStream | null = null;
  private outputStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private animationFrame = 0;
  private audioTimer: number | null = null;
  private audioContext: AudioContext | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private readonly audioEntries = new Map<string, AudioEntry>();
  private readonly videoEntries = new Map<string, VideoEntry>();

  constructor(getSnapshot: () => MeetingRecorderSnapshot) {
    this.getSnapshot = getSnapshot;
  }

  static isSupported() {
    return (
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      typeof HTMLCanvasElement !== "undefined" &&
      typeof AudioContext !== "undefined"
    );
  }

  isActive() {
    return Boolean(this.recorder && this.recorder.state !== "inactive");
  }

  async start() {
    if (this.isActive()) return;
    if (!CohivaBrowserMeetingRecorder.isSupported()) {
      throw new Error("This browser does not support Cohiva meeting recording.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Cohiva could not initialize the recording canvas.");
    }

    const audioContext = new AudioContext();
    await audioContext.resume().catch(() => {});
    const audioDestination = audioContext.createMediaStreamDestination();

    this.canvas = canvas;
    this.context = context;
    this.audioContext = audioContext;
    this.audioDestination = audioDestination;

    this.reconcileAudio();
    this.audioTimer = window.setInterval(() => this.reconcileAudio(), 500);

    const canvasStream = canvas.captureStream(FPS);
    const outputStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);

    const mimeType = chooseMimeType();
    const recorder = new MediaRecorder(outputStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 3_000_000,
      audioBitsPerSecond: 128_000,
    });

    this.canvasStream = canvasStream;
    this.outputStream = outputStream;
    this.recorder = recorder;
    this.chunks = [];
    this.startedAt = Date.now();

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });

    recorder.start(1000);
    this.renderFrame();
  }

  async stop() {
    const recorder = this.recorder;
    const durationMs = Math.max(0, Date.now() - this.startedAt);

    if (!recorder || recorder.state === "inactive") {
      this.cleanup();
      return {
        blob: new Blob([], { type: "video/webm" }),
        durationMs,
      };
    }

    const mimeType = recorder.mimeType || "video/webm";

    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });

    recorder.stop();
    await stopped;

    const blob = new Blob(this.chunks, { type: mimeType });
    this.cleanup();

    return { blob, durationMs };
  }

  private reconcileAudio() {
    const audioContext = this.audioContext;
    const destination = this.audioDestination;
    if (!audioContext || !destination) return;

    const snapshot = this.getSnapshot();
    const wanted = new Map<string, MediaStreamTrack>();

    const localTrack = snapshot.localMicrophoneTrack;
    if (localTrack && localTrack.readyState === "live") {
      wanted.set(localTrack.id, localTrack);
    }

    for (const media of Object.values(snapshot.remoteMedia)) {
      for (const track of media.cameraStream.getAudioTracks()) {
        if (track.readyState === "live") wanted.set(track.id, track);
      }
    }

    for (const [trackId, entry] of this.audioEntries) {
      if (wanted.has(trackId)) continue;
      try {
        entry.node.disconnect();
      } catch {}
      this.audioEntries.delete(trackId);
    }

    for (const [trackId, track] of wanted) {
      if (this.audioEntries.has(trackId)) continue;
      try {
        const stream = new MediaStream([track]);
        const node = audioContext.createMediaStreamSource(stream);
        node.connect(destination);
        this.audioEntries.set(trackId, { node, stream });
      } catch (error) {
        console.warn("Unable to add audio track to Cohiva recording:", error);
      }
    }
  }

  private getVideoElement(key: string, stream: MediaStream | null) {
    const track = stream?.getVideoTracks().find((item) => item.readyState === "live");
    if (!track) {
      const old = this.videoEntries.get(key);
      if (old) {
        old.element.srcObject = null;
        this.videoEntries.delete(key);
      }
      return null;
    }

    const existing = this.videoEntries.get(key);
    if (existing?.trackId === track.id) return existing.element;

    if (existing) existing.element.srcObject = null;

    const element = document.createElement("video");
    element.autoplay = true;
    element.muted = true;
    element.playsInline = true;
    element.srcObject = new MediaStream([track]);
    void element.play().catch(() => {});

    this.videoEntries.set(key, { element, trackId: track.id });
    return element;
  }

  private drawVideoCover(
    video: HTMLVideoElement,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const context = this.context;
    if (!context || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return false;
    }

    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (video.videoWidth - sourceWidth) / 2;
    const sourceY = (video.videoHeight - sourceHeight) / 2;

    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height
    );
    return true;
  }

  private drawVideoContain(
    video: HTMLVideoElement,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const context = this.context;
    if (!context || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return false;
    }

    const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    context.drawImage(
      video,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    return true;
  }

  private drawFallback(
    name: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const context = this.context;
    if (!context) return;

    context.fillStyle = "#302B27";
    context.fillRect(x, y, width, height);

    const size = Math.max(56, Math.min(118, Math.min(width, height) * 0.28));
    const centerX = x + width / 2;
    const centerY = y + height / 2 - 14;

    context.beginPath();
    context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    context.fillStyle = "#CC3A63";
    context.fill();

    context.fillStyle = "#FFFFFF";
    context.font = `800 ${Math.round(size * 0.36)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(initials(name), centerX, centerY + 1);
  }

  private drawNameBar(
    name: string,
    isHost: boolean,
    isSelf: boolean,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const context = this.context;
    if (!context) return;

    const label = `${name}${isHost ? " · Host" : ""}${isSelf ? " · You" : ""}`;
    const barHeight = Math.min(50, Math.max(38, height * 0.14));
    const gradient = context.createLinearGradient(0, y + height - barHeight, 0, y + height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.82)");
    context.fillStyle = gradient;
    context.fillRect(x, y + height - barHeight, width, barHeight);

    context.fillStyle = "#FFFFFF";
    context.font = "700 18px system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillText(label.slice(0, 54), x + 16, y + height - 14, width - 32);
  }

  private drawTile(
    participant: RecorderParticipant,
    stream: MediaStream | null,
    x: number,
    y: number,
    width: number,
    height: number,
    selfUserId: string
  ) {
    const context = this.context;
    if (!context) return;

    context.save();
    roundedRect(context, x, y, width, height, 18);
    context.clip();
    context.fillStyle = "#181614";
    context.fillRect(x, y, width, height);

    const video = this.getVideoElement(`camera:${participant.userId}`, stream);
    const drewVideo = video
      ? this.drawVideoCover(video, x, y, width, height)
      : false;

    if (!drewVideo) {
      this.drawFallback(participant.name, x, y, width, height);
    }

    this.drawNameBar(
      participant.name,
      participant.isHost === true,
      participant.userId === selfUserId,
      x,
      y,
      width,
      height
    );
    context.restore();
  }

  private renderFrame = () => {
    const context = this.context;
    if (!context) return;

    const snapshot = this.getSnapshot();
    context.fillStyle = "#181614";
    context.fillRect(0, 0, WIDTH, HEIGHT);

    const participantById = new Map(
      snapshot.participants.map((participant) => [participant.userId, participant])
    );

    const participants = [...snapshot.participants];
    if (
      snapshot.selfUserId &&
      !participants.some((participant) => participant.userId === snapshot.selfUserId)
    ) {
      participants.unshift({
        userId: snapshot.selfUserId,
        name: "You",
        isHost: true,
      });
    }

    const screens: Array<{
      key: string;
      name: string;
      stream: MediaStream;
    }> = [];

    if (snapshot.localScreenStream?.getVideoTracks().some((track) => track.readyState === "live")) {
      screens.push({
        key: `screen:${snapshot.selfUserId}`,
        name: "Your screen",
        stream: snapshot.localScreenStream,
      });
    }

    for (const [userId, media] of Object.entries(snapshot.remoteMedia)) {
      if (!media.screenStream.getVideoTracks().some((track) => track.readyState === "live")) {
        continue;
      }
      screens.push({
        key: `screen:${userId}`,
        name: `${participantById.get(userId)?.name || "Participant"}'s screen`,
        stream: media.screenStream,
      });
    }

    if (screens.length > 0) {
      const margin = 18;
      const sideWidth = 270;
      const mainX = margin;
      const mainY = margin;
      const mainWidth = WIDTH - sideWidth - margin * 3;
      const mainHeight = HEIGHT - margin * 2;

      context.save();
      roundedRect(context, mainX, mainY, mainWidth, mainHeight, 18);
      context.clip();
      context.fillStyle = "#000000";
      context.fillRect(mainX, mainY, mainWidth, mainHeight);
      const screenVideo = this.getVideoElement(screens[0].key, screens[0].stream);
      if (screenVideo) {
        this.drawVideoContain(screenVideo, mainX, mainY, mainWidth, mainHeight);
      }
      context.fillStyle = "rgba(0,0,0,0.65)";
      context.fillRect(mainX + 16, mainY + 16, Math.min(mainWidth - 32, 280), 38);
      context.fillStyle = "#FFFFFF";
      context.font = "700 16px system-ui, sans-serif";
      context.textAlign = "left";
      context.fillText(screens[0].name.slice(0, 34), mainX + 28, mainY + 41);
      context.restore();

      const tileX = WIDTH - sideWidth - margin;
      const gap = 12;
      const visible = participants.slice(0, 4);
      const tileHeight = Math.max(120, (HEIGHT - margin * 2 - gap * Math.max(0, visible.length - 1)) / Math.max(1, visible.length));

      visible.forEach((participant, index) => {
        const stream =
          participant.userId === snapshot.selfUserId
            ? snapshot.localCameraStream
            : snapshot.remoteMedia[participant.userId]?.cameraStream || null;
        this.drawTile(
          participant,
          stream,
          tileX,
          margin + index * (tileHeight + gap),
          sideWidth,
          tileHeight,
          snapshot.selfUserId
        );
      });
    } else {
      const count = Math.max(1, participants.length);
      const columns = count <= 1 ? 1 : count <= 4 ? 2 : 3;
      const rows = Math.ceil(count / columns);
      const gap = 14;
      const margin = 18;
      const tileWidth = (WIDTH - margin * 2 - gap * (columns - 1)) / columns;
      const tileHeight = (HEIGHT - margin * 2 - gap * (rows - 1)) / rows;

      participants.forEach((participant, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const stream =
          participant.userId === snapshot.selfUserId
            ? snapshot.localCameraStream
            : snapshot.remoteMedia[participant.userId]?.cameraStream || null;

        this.drawTile(
          participant,
          stream,
          margin + column * (tileWidth + gap),
          margin + row * (tileHeight + gap),
          tileWidth,
          tileHeight,
          snapshot.selfUserId
        );
      });
    }

    // Recording mark in the exported video itself.
    context.fillStyle = "rgba(204,58,99,0.92)";
    roundedRect(context, 24, 24, 118, 38, 19);
    context.fill();
    context.fillStyle = "#FFFFFF";
    context.beginPath();
    context.arc(43, 43, 6, 0, Math.PI * 2);
    context.fill();
    context.font = "800 14px system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("REC", 57, 43);

    this.animationFrame = window.requestAnimationFrame(this.renderFrame);
  };

  private cleanup() {
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }

    if (this.audioTimer !== null) {
      window.clearInterval(this.audioTimer);
      this.audioTimer = null;
    }

    for (const entry of this.audioEntries.values()) {
      try {
        entry.node.disconnect();
      } catch {}
    }
    this.audioEntries.clear();

    for (const entry of this.videoEntries.values()) {
      entry.element.srcObject = null;
    }
    this.videoEntries.clear();

    try {
      this.outputStream?.getTracks().forEach((track) => track.stop());
      this.canvasStream?.getTracks().forEach((track) => track.stop());
    } catch {}

    void this.audioContext?.close().catch(() => {});

    this.recorder = null;
    this.canvas = null;
    this.context = null;
    this.canvasStream = null;
    this.outputStream = null;
    this.audioContext = null;
    this.audioDestination = null;
    this.chunks = [];
    this.startedAt = 0;
  }
}
