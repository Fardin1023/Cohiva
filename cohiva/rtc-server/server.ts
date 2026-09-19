import { createHmac } from "node:crypto";
import http from "node:http";
import { URL } from "node:url";

import * as mediasoup from "mediasoup";
import { WebSocket, WebSocketServer } from "ws";

import {
  type RtcTokenPayload,
  verifyRtcToken,
} from "../lib/rtc/token";
import { finalizeMeetingInDatabase } from "../lib/meetings/lifecycle";

type JsonObject = Record<string, any>;

type Peer = {
  ws: WebSocket;
  token: RtcTokenPayload;
  joined: boolean;
  transports: Map<string, any>;
  producers: Map<string, any>;
  consumers: Map<string, any>;
};

type Room = {
  id: string;
  router: any;
  peers: Map<string, Peer>;
  blocked: Set<string>;
  permissions: Record<string, boolean>;
  individualPermissions: Record<string, Record<string, boolean>>;
  maxParticipants: number;
  durationMinutes: number;
  startedAt: Date | null;
  timerEndsAt: Date | null;
  durationTimer: ReturnType<typeof setTimeout> | null;
  emptyTimer: ReturnType<typeof setTimeout> | null;
  ended: boolean;
  recordingActive: boolean;
  recordingStartedAt: Date | null;
};

const SIGNAL_PORT = Number(process.env.COHIVA_RTC_PORT || 4100);
const MEDIA_PORT = Number(process.env.COHIVA_RTC_MEDIA_PORT || 4101);
const LISTEN_IP = process.env.COHIVA_RTC_LISTEN_IP?.trim() || "0.0.0.0";
const ANNOUNCED_ADDRESS =
  process.env.COHIVA_RTC_ANNOUNCED_ADDRESS?.trim() || "127.0.0.1";
const SECRET = process.env.COHIVA_RTC_SECRET?.trim() || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ALLOWED_ORIGINS = (process.env.COHIVA_RTC_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const TURN_URLS = (process.env.COHIVA_TURN_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const TURN_SECRET = process.env.COHIVA_TURN_SECRET || "";
const TURN_CREDENTIAL_TTL_SECONDS = Math.max(
  300,
  Math.min(86_400, Number(process.env.COHIVA_TURN_CREDENTIAL_TTL_SECONDS || 3600) || 3600)
);
const ICE_TRANSPORT_POLICY =
  process.env.COHIVA_RTC_ICE_TRANSPORT_POLICY === "relay" ? "relay" : "all";

const createTurnIceServers = (userId: string) => {
  if (!TURN_URLS.length || !TURN_SECRET) return [];

  const expiresAt = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
  const safeUserId = userId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96) || "user";
  const username = `${expiresAt}:${safeUserId}`;
  const credential = createHmac("sha1", TURN_SECRET)
    .update(username)
    .digest("base64");

  return [
    {
      urls: TURN_URLS,
      username,
      credential,
    },
  ];
};

if (!SECRET) {
  console.error("COHIVA_RTC_SECRET is required.");
  process.exit(1);
}

if (IS_PRODUCTION && SECRET.length < 32) {
  console.error("COHIVA_RTC_SECRET must be at least 32 characters in production.");
  process.exit(1);
}

if (IS_PRODUCTION && ALLOWED_ORIGINS.length === 0) {
  console.error("COHIVA_RTC_ALLOWED_ORIGINS is required in production.");
  process.exit(1);
}

if (IS_PRODUCTION && /^(127\.|0\.0\.0\.0$|localhost$)/i.test(ANNOUNCED_ADDRESS)) {
  console.error("COHIVA_RTC_ANNOUNCED_ADDRESS must be the public RTC address in production.");
  process.exit(1);
}

if (TURN_URLS.length && TURN_SECRET.length < 32) {
  console.error("COHIVA_TURN_SECRET must be at least 32 characters when TURN is enabled.");
  process.exit(1);
}

const DEFAULT_PERMISSIONS = {
  studentMic: true,
  studentCamera: true,
  studentScreenShare: true,
  studentRecording: false,
  studentWhiteboard: false,
};

const mediaCodecs: any[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {},
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  },
];

const rooms = new Map<string, Room>();
let worker: any;
let webRtcServer: any;

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(bytes.length),
  });
  res.end(bytes);
};

const readJson = async (req: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
};

const authorizedInternal = (req: http.IncomingMessage) =>
  req.headers.authorization === `Bearer ${SECRET}`;

const safeSend = (ws: WebSocket, value: unknown) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(value));
  }
};

const sendEvent = (peer: Peer, event: string, data: JsonObject = {}) => {
  safeSend(peer.ws, {
    type: "event",
    event,
    data,
  });
};

const broadcast = (
  room: Room,
  event: string,
  data: JsonObject = {},
  options?: { exceptUserId?: string; targetUserId?: string }
) => {
  for (const [userId, peer] of room.peers) {
    if (!peer.joined) continue;
    if (options?.exceptUserId === userId) continue;
    if (options?.targetUserId && options.targetUserId !== userId) continue;
    sendEvent(peer, event, data);
  }
};

const participantShape = (peer: Peer) => ({
  userId: peer.token.userId,
  name: peer.token.name,
  image: peer.token.image,
  avatarIcon: peer.token.avatarIcon ?? "",
  isHost: peer.token.role === "host",
});

const producerShape = (peer: Peer, producer: any) => ({
  producerId: producer.id,
  userId: peer.token.userId,
  kind: producer.kind,
  appData: producer.appData ?? {},
});

const roomStats = (room: Room) => {
  const peers = Array.from(room.peers.values()).filter((peer) => peer.joined);
  return {
    participantCount: peers.length,
    participants: peers.map(participantShape),
    startedAt: room.startedAt?.toISOString() ?? null,
    timerEndsAt: room.timerEndsAt?.toISOString() ?? null,
  };
};

const normalizePermissions = (custom: Record<string, unknown>) => ({
  ...DEFAULT_PERMISSIONS,
  ...((custom.cohiva_permissions ?? {}) as Record<string, boolean>),
  studentRecording: false,
});

const normalizeIndividualPermissions = (custom: Record<string, unknown>) => {
  const raw = custom.cohiva_individual_permissions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, Record<string, boolean>>;
};

const createRoom = async (token: RtcTokenPayload): Promise<Room> => {
  const router = await worker.createRouter({ mediaCodecs });

  const room: Room = {
    id: token.callId,
    router,
    peers: new Map(),
    blocked: new Set(),
    permissions: normalizePermissions(token.custom),
    individualPermissions: normalizeIndividualPermissions(token.custom),
    maxParticipants: token.maxParticipants,
    durationMinutes: token.durationMinutes,
    startedAt: token.startedAt ? new Date(token.startedAt) : null,
    timerEndsAt: token.timerEndsAt ? new Date(token.timerEndsAt) : null,
    durationTimer: null,
    emptyTimer: null,
    ended: false,
    recordingActive: false,
    recordingStartedAt: null,
  };

  rooms.set(token.callId, room);

  if (room.timerEndsAt) {
    const remaining = room.timerEndsAt.getTime() - Date.now();
    if (remaining <= 0) {
      setTimeout(() => endRoom(room), 0);
    } else {
      room.durationTimer = setTimeout(() => endRoom(room), Math.max(1_000, remaining));
    }
  }

  return room;
};

const getOrCreateRoom = async (token: RtcTokenPayload) => {
  const existing = rooms.get(token.callId);
  if (existing && !existing.ended) {
    existing.maxParticipants = token.maxParticipants;
    existing.durationMinutes = token.durationMinutes;

    if (token.startedAt) {
      existing.startedAt = new Date(token.startedAt);
    }
    if (token.timerEndsAt) {
      const nextTimerEndsAt = new Date(token.timerEndsAt);
      const timerChanged =
        !existing.timerEndsAt ||
        existing.timerEndsAt.getTime() !== nextTimerEndsAt.getTime();
      existing.timerEndsAt = nextTimerEndsAt;
      if (timerChanged) {
        if (existing.durationTimer) clearTimeout(existing.durationTimer);
        existing.durationTimer = setTimeout(
          () => endRoom(existing),
          Math.max(1_000, nextTimerEndsAt.getTime() - Date.now())
        );
      }
    }

    if (token.role === "host") {
      existing.permissions = normalizePermissions(token.custom);
      existing.individualPermissions = normalizeIndividualPermissions(token.custom);
    }
    return existing;
  }
  return createRoom(token);
};

const closePeerMedia = (peer: Peer) => {
  for (const consumer of peer.consumers.values()) {
    try {
      consumer.close();
    } catch {}
  }
  peer.consumers.clear();

  for (const producer of peer.producers.values()) {
    try {
      producer.close();
    } catch {}
  }
  peer.producers.clear();

  for (const transport of peer.transports.values()) {
    try {
      transport.close();
    } catch {}
  }
  peer.transports.clear();
};

const scheduleRoomCleanup = (room: Room) => {
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  room.emptyTimer = setTimeout(() => {
    const active = Array.from(room.peers.values()).some((peer) => peer.joined);
    if (active || room.ended) return;
    try {
      room.router.close();
    } catch {}
    rooms.delete(room.id);
  }, 60_000);
};

const removePeer = (room: Room, peer: Peer) => {
  const userId = peer.token.userId;
  const wasJoined = peer.joined;

  closePeerMedia(peer);

  if (room.peers.get(userId) === peer) {
    room.peers.delete(userId);
  }

  if (wasJoined && peer.token.role === "host" && room.recordingActive) {
    room.recordingActive = false;
    room.recordingStartedAt = null;
    broadcast(room, "cohiva.recording-state", {
      active: false,
      startedAt: null,
    });
  }

  if (wasJoined) {
    broadcast(room, "call.session_participant_left", {
      participant: {
        user: { id: userId },
        user_id: userId,
      },
    });
    broadcast(room, "participant-left", { userId });
  }

  if (Array.from(room.peers.values()).every((item) => !item.joined)) {
    scheduleRoomCleanup(room);
  }
};

const endRoom = (room: Room) => {
  if (room.ended) return;
  room.ended = true;

  const endedAt = room.timerEndsAt && room.timerEndsAt.getTime() <= Date.now()
    ? room.timerEndsAt
    : new Date();

  if (room.durationTimer) clearTimeout(room.durationTimer);
  if (room.emptyTimer) clearTimeout(room.emptyTimer);

  /*
   * Persist the terminal state from the RTC process too. This is essential
   * for duration-based endings: without it the WebSocket room would close
   * but the old meeting link could create a fresh RTC room afterwards.
   */
  void finalizeMeetingInDatabase(room.id, endedAt).catch((error) => {
    console.error("Unable to persist RTC meeting end:", error);
  });

  if (room.recordingActive) {
    room.recordingActive = false;
    room.recordingStartedAt = null;
    broadcast(room, "cohiva.recording-state", { active: false, startedAt: null });
  }

  broadcast(room, "call.ended", { endedAt: endedAt.toISOString() });

  for (const peer of room.peers.values()) {
    closePeerMedia(peer);
    try {
      peer.ws.close(4000, "Meeting ended");
    } catch {}
  }

  room.peers.clear();

  setTimeout(() => {
    try {
      room.router.close();
    } catch {}
    rooms.delete(room.id);
  }, 500);
};

const canProduce = (room: Room, peer: Peer, kind: string, source: string) => {
  if (peer.token.role === "host") return true;

  const individual = room.individualPermissions[peer.token.userId] ?? {};

  if (kind === "audio") {
    return room.permissions.studentMic !== false && individual.audio !== false;
  }

  if (source === "screen") {
    return (
      room.permissions.studentScreenShare !== false && individual.screenShare !== false
    );
  }

  return room.permissions.studentCamera !== false && individual.video !== false;
};

const closeMatchingProducers = (
  peer: Peer,
  matcher: (producer: any) => boolean
) => {
  for (const producer of Array.from(peer.producers.values())) {
    if (!matcher(producer)) continue;
    try {
      producer.close();
    } catch {}
  }
};

const updateRoomCustom = (room: Room, custom: Record<string, unknown>) => {
  room.permissions = normalizePermissions(custom);
  room.individualPermissions = normalizeIndividualPermissions(custom);

  for (const peer of room.peers.values()) {
    if (!peer.joined || peer.token.role === "host") continue;

    if (!canProduce(room, peer, "audio", "microphone")) {
      closeMatchingProducers(peer, (producer) => producer.kind === "audio");
    }

    if (!canProduce(room, peer, "video", "camera")) {
      closeMatchingProducers(
        peer,
        (producer) => producer.kind === "video" && producer.appData?.source !== "screen"
      );
    }

    if (!canProduce(room, peer, "video", "screen")) {
      closeMatchingProducers(
        peer,
        (producer) => producer.appData?.source === "screen"
      );
    }
  }
};

const createTransport = async (room: Room, peer: Peer) => {
  const transport = await room.router.createWebRtcTransport({
    webRtcServer,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_500_000,
    appData: {
      userId: peer.token.userId,
    },
  });

  peer.transports.set(transport.id, transport);

  transport.on("dtlsstatechange", (state: string) => {
    if (state === "closed") {
      try {
        transport.close();
      } catch {}
    }
  });

  transport.on("close", () => {
    peer.transports.delete(transport.id);
  });

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    sctpParameters: transport.sctpParameters,
    iceServers: createTurnIceServers(peer.token.userId),
    iceTransportPolicy: ICE_TRANSPORT_POLICY,
  };
};

const handleRequest = async (
  room: Room,
  peer: Peer,
  action: string,
  data: JsonObject
): Promise<any> => {
  if (action === "join") {
    if (room.ended) {
      throw new Error("This meeting has ended.");
    }

    if (room.blocked.has(peer.token.userId)) {
      throw new Error("You have been blocked from this meeting.");
    }

    const joinedCount = Array.from(room.peers.values()).filter(
      (item) => item.joined && item !== peer
    ).length;

    if (!peer.joined && joinedCount >= room.maxParticipants) {
      throw new Error(
        `This meeting is full. The participant limit is ${room.maxParticipants}.`
      );
    }

    if (!peer.joined) {
      peer.joined = true;

      if (!room.startedAt) {
        if (peer.token.role !== "host") {
          peer.joined = false;
          throw new Error("The host has not started this meeting yet.");
        }

        /* Backward-compatible fallback. New tokens already carry the
           MongoDB-backed session timestamps. */
        room.startedAt = new Date();
        room.timerEndsAt = new Date(
          room.startedAt.getTime() + room.durationMinutes * 60_000
        );
        room.durationTimer = setTimeout(
          () => endRoom(room),
          Math.max(1_000, room.timerEndsAt.getTime() - Date.now())
        );
      }

      broadcast(
        room,
        "participant-joined",
        { participant: participantShape(peer) },
        { exceptUserId: peer.token.userId }
      );
    }

    const participants = Array.from(room.peers.values())
      .filter((item) => item.joined)
      .map(participantShape);

    const producers = Array.from(room.peers.values())
      .filter((item) => item.joined)
      .flatMap((item) =>
        Array.from(item.producers.values()).map((producer) =>
          producerShape(item, producer)
        )
      );

    return {
      routerRtpCapabilities: room.router.rtpCapabilities,
      participants,
      producers,
      startedAt: room.startedAt?.toISOString() ?? null,
      timerEndsAt: room.timerEndsAt?.toISOString() ?? null,
      maxParticipants: room.maxParticipants,
      selfRole: peer.token.role,
      permissions: room.permissions,
      individualPermissions: room.individualPermissions,
      recordingActive: room.recordingActive,
      recordingStartedAt: room.recordingStartedAt?.toISOString() ?? null,
    };
  }

  if (!peer.joined) {
    throw new Error("Join the meeting first.");
  }

  if (action === "createTransport") {
    return createTransport(room, peer);
  }

  if (action === "connectTransport") {
    const transport = peer.transports.get(String(data.transportId ?? ""));
    if (!transport) throw new Error("Transport not found.");
    await transport.connect({ dtlsParameters: data.dtlsParameters });
    return { connected: true };
  }

  if (action === "produce") {
    const transport = peer.transports.get(String(data.transportId ?? ""));
    if (!transport) throw new Error("Transport not found.");

    const source = String(data.appData?.source ?? "camera");
    const kind = String(data.kind ?? "");

    if (!canProduce(room, peer, kind, source)) {
      throw new Error("The host has disabled this media permission.");
    }

    const producer = await transport.produce({
      kind: data.kind,
      rtpParameters: data.rtpParameters,
      appData: {
        ...(data.appData ?? {}),
        userId: peer.token.userId,
      },
    });

    peer.producers.set(producer.id, producer);

    const notifyClosed = () => {
      if (!peer.producers.has(producer.id)) return;
      peer.producers.delete(producer.id);
      broadcast(room, "producer-removed", {
        producerId: producer.id,
        userId: peer.token.userId,
        kind: producer.kind,
        appData: producer.appData ?? {},
      });
    };

    producer.on("transportclose", notifyClosed);
    producer.observer.on("close", notifyClosed);

    broadcast(
      room,
      "producer-added",
      producerShape(peer, producer),
      { exceptUserId: peer.token.userId }
    );

    return { id: producer.id };
  }

  if (action === "closeProducer") {
    const producer = peer.producers.get(String(data.producerId ?? ""));
    if (producer) producer.close();
    return { closed: true };
  }

  if (action === "consume") {
    const transport = peer.transports.get(String(data.transportId ?? ""));
    if (!transport) throw new Error("Transport not found.");

    const producerId = String(data.producerId ?? "");

    if (
      !room.router.canConsume({
        producerId,
        rtpCapabilities: data.rtpCapabilities,
      })
    ) {
      throw new Error("This producer cannot be consumed by the browser.");
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities: data.rtpCapabilities,
      paused: true,
      appData: {
        userId: peer.token.userId,
      },
    });

    peer.consumers.set(consumer.id, consumer);

    consumer.on("transportclose", () => peer.consumers.delete(consumer.id));
    consumer.on("producerclose", () => {
      peer.consumers.delete(consumer.id);
      sendEvent(peer, "consumer-closed", {
        consumerId: consumer.id,
        producerId,
      });
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  }

  if (action === "resumeConsumer") {
    const consumer = peer.consumers.get(String(data.consumerId ?? ""));
    if (!consumer) throw new Error("Consumer not found.");
    await consumer.resume();
    return { resumed: true };
  }

  if (action === "customEvent") {
    broadcast(room, "custom", {
      custom: data.custom ?? {},
      user_id: peer.token.userId,
    });
    return { sent: true };
  }

  if (action === "moderate") {
    if (peer.token.role !== "host") {
      throw new Error("Only the host can moderate participants.");
    }

    const targetUserId = String(data.targetUserId ?? "");
    const target = room.peers.get(targetUserId);
    if (!target || !target.joined) throw new Error("Participant not found.");

    const control = String(data.control ?? "");

    if (control === "audio") {
      closeMatchingProducers(target, (producer) => producer.kind === "audio");
      sendEvent(target, "cohiva.media-disabled", { control: "audio" });
    } else if (control === "video") {
      closeMatchingProducers(
        target,
        (producer) => producer.kind === "video" && producer.appData?.source !== "screen"
      );
      sendEvent(target, "cohiva.media-disabled", { control: "video" });
    } else if (control === "screenshare") {
      closeMatchingProducers(target, (producer) => producer.appData?.source === "screen");
      sendEvent(target, "cohiva.media-disabled", { control: "screenshare" });
    } else if (control === "kick" || control === "block") {
      if (control === "block") room.blocked.add(targetUserId);
      sendEvent(target, "cohiva.kicked", { blocked: control === "block" });
      target.ws.close(4001, control === "block" ? "Blocked" : "Removed");
    } else {
      throw new Error("Unsupported moderation action.");
    }

    return { success: true };
  }

  if (action === "muteOthers") {
    if (peer.token.role !== "host") {
      throw new Error("Only the host can moderate participants.");
    }

    const control = String(data.control ?? "");
    for (const target of room.peers.values()) {
      if (!target.joined || target === peer) continue;
      if (control === "audio") {
        closeMatchingProducers(target, (producer) => producer.kind === "audio");
        sendEvent(target, "cohiva.media-disabled", { control: "audio" });
      } else if (control === "video") {
        closeMatchingProducers(
          target,
          (producer) => producer.kind === "video" && producer.appData?.source !== "screen"
        );
        sendEvent(target, "cohiva.media-disabled", { control: "video" });
      } else if (control === "screenshare") {
        closeMatchingProducers(target, (producer) => producer.appData?.source === "screen");
        sendEvent(target, "cohiva.media-disabled", { control: "screenshare" });
      }
    }
    return { success: true };
  }

  if (action === "setRoomPermission") {
    if (peer.token.role !== "host") {
      throw new Error("Only the host can change permissions.");
    }

    const field = String(data.field ?? "");
    const allowed = data.allowed === true;
    if (!["studentMic", "studentCamera", "studentScreenShare"].includes(field)) {
      throw new Error("Invalid room permission field.");
    }

    room.permissions = {
      ...room.permissions,
      [field]: allowed,
    };

    if (!allowed) {
      for (const target of room.peers.values()) {
        if (!target.joined || target.token.role === "host") continue;

        if (field === "studentMic") {
          closeMatchingProducers(target, (producer) => producer.kind === "audio");
          sendEvent(target, "cohiva.media-disabled", { control: "audio" });
        } else if (field === "studentCamera") {
          closeMatchingProducers(
            target,
            (producer) => producer.kind === "video" && producer.appData?.source !== "screen"
          );
          sendEvent(target, "cohiva.media-disabled", { control: "video" });
        } else if (field === "studentScreenShare") {
          closeMatchingProducers(
            target,
            (producer) => producer.appData?.source === "screen"
          );
          sendEvent(target, "cohiva.media-disabled", { control: "screenshare" });
        }
      }
    }

    broadcast(room, "cohiva.permissions-updated", {
      permissions: room.permissions,
      individualPermissions: room.individualPermissions,
    });

    return {
      success: true,
      permissions: room.permissions,
      individualPermissions: room.individualPermissions,
    };
  }

  if (action === "setIndividualPermission") {
    if (peer.token.role !== "host") {
      throw new Error("Only the host can change permissions.");
    }

    const targetUserId = String(data.targetUserId ?? "");
    const field = String(data.field ?? "");
    const allowed = data.allowed === true;

    if (!["audio", "video", "screenShare"].includes(field)) {
      throw new Error("Invalid permission field.");
    }

    room.individualPermissions[targetUserId] = {
      ...(room.individualPermissions[targetUserId] ?? {}),
      [field]: allowed,
    };

    const target = room.peers.get(targetUserId);
    if (target && !allowed) {
      if (field === "audio") {
        closeMatchingProducers(target, (producer) => producer.kind === "audio");
        sendEvent(target, "cohiva.media-disabled", { control: "audio" });
      } else if (field === "video") {
        closeMatchingProducers(
          target,
          (producer) => producer.kind === "video" && producer.appData?.source !== "screen"
        );
        sendEvent(target, "cohiva.media-disabled", { control: "video" });
      } else {
        closeMatchingProducers(target, (producer) => producer.appData?.source === "screen");
        sendEvent(target, "cohiva.media-disabled", { control: "screenshare" });
      }
    }

    broadcast(room, "cohiva.permissions-updated", {
      permissions: room.permissions,
      individualPermissions: room.individualPermissions,
    });

    return {
      success: true,
      permissions: room.permissions,
      individualPermissions: room.individualPermissions,
    };
  }

  if (action === "setLimits") {
    if (peer.token.role !== "host") {
      throw new Error("Only the host can change meeting limits.");
    }

    const nextMaxParticipants = Math.max(
      2,
      Math.min(20, Number(data.maxParticipants) || room.maxParticipants)
    );

    const nextDurationMinutes = Math.max(
      1,
      Math.min(45, Number(data.durationMinutes) || room.durationMinutes)
    );

    const currentParticipantCount = Array.from(room.peers.values()).filter(
      (item) => item.joined
    ).length;

    if (nextMaxParticipants < currentParticipantCount) {
      throw new Error(
        `The participant limit cannot be lower than the ${currentParticipantCount} people currently in the meeting.`
      );
    }

    room.maxParticipants = nextMaxParticipants;
    room.durationMinutes = nextDurationMinutes;

    if (room.startedAt) {
      room.timerEndsAt = new Date(
        room.startedAt.getTime() + nextDurationMinutes * 60_000
      );

      if (room.durationTimer) {
        clearTimeout(room.durationTimer);
      }

      room.durationTimer = setTimeout(
        () => endRoom(room),
        Math.max(1_000, room.timerEndsAt.getTime() - Date.now())
      );
    }

    const update = {
      durationMinutes: room.durationMinutes,
      maxParticipants: room.maxParticipants,
      timerEndsAt: room.timerEndsAt?.toISOString() ?? null,
    };

    broadcast(room, "cohiva.limits-updated", update);

    return { success: true, ...update };
  }

  if (action === "setRecordingState") {
    if (peer.token.role !== "host") {
      throw new Error("Only the host can control meeting recording.");
    }

    const active = data.active === true;

    if (active) {
      if (!room.recordingActive) {
        room.recordingActive = true;
        room.recordingStartedAt = new Date();
      }
    } else {
      room.recordingActive = false;
      room.recordingStartedAt = null;
    }

    const update = {
      active: room.recordingActive,
      startedAt: room.recordingStartedAt?.toISOString() ?? null,
    };

    broadcast(room, "cohiva.recording-state", update);
    return { success: true, ...update };
  }

  if (action === "endMeeting") {
    if (peer.token.role !== "host") {
      throw new Error("Only the host can end the meeting.");
    }
    // Return the request response first, then broadcast/close the room.
    setTimeout(() => endRoom(room), 0);
    return { success: true };
  }

  if (action === "pinForEveryone") {
    if (peer.token.role !== "host") {
      throw new Error("Only the host can spotlight a participant.");
    }
    broadcast(room, "cohiva.pin", {
      userId: data.userId ?? null,
      pinned: data.pinned !== false,
    });
    return { success: true };
  }

  throw new Error(`Unknown RTC action: ${action}`);
};

const handleSocket = (ws: WebSocket, token: RtcTokenPayload) => {
  /*
   * Important: attach the WebSocket message listener immediately.
   *
   * A brand-new room has to create its mediasoup Router first. That is
   * asynchronous and can take long enough for the browser's WebSocket
   * "open" event to fire and send the initial `join` request. Previously
   * the message listener was attached only after createRouter() finished,
   * so the very first join request for a new room could be lost and the
   * client would wait until its request timeout. A refresh then worked
   * because the room/router already existed.
   *
   * `setupPromise` lets requests arrive immediately and wait for room/peer
   * initialization instead of being dropped.
   */
  let closed = false;

  const setupPromise = (async () => {
    const room = await getOrCreateRoom(token);

    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
    }

    const old = room.peers.get(token.userId);
    if (old && old.ws !== ws) {
      try {
        old.ws.close(4002, "Reconnected elsewhere");
      } catch {}
      removePeer(room, old);
    }

    const peer: Peer = {
      ws,
      token,
      joined: false,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };

    room.peers.set(token.userId, peer);

    // The socket may have closed while the mediasoup room was being created.
    if (closed) {
      removePeer(room, peer);
    }

    return { room, peer };
  })();

  ws.on("message", async (raw) => {
    let message: JsonObject;
    try {
      message = JSON.parse(raw.toString()) as JsonObject;
    } catch {
      return;
    }

    if (message.type !== "request" || !message.id || !message.action) {
      return;
    }

    try {
      const { room, peer } = await setupPromise;

      if (closed || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const data = await handleRequest(
        room,
        peer,
        String(message.action),
        (message.data ?? {}) as JsonObject
      );

      safeSend(ws, {
        type: "response",
        id: message.id,
        ok: true,
        data,
      });
    } catch (error) {
      safeSend(ws, {
        type: "response",
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : "RTC request failed.",
      });
    }
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;

    void setupPromise
      .then(({ room, peer }) => removePeer(room, peer))
      .catch(() => {});
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);

  void setupPromise.catch((error) => {
    console.error("RTC socket setup error:", error);
    try {
      ws.close(1011, "RTC setup failed");
    } catch {}
  });
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  if (url.pathname.startsWith("/internal/") && !authorizedInternal(req)) {
    return json(res, 401, { error: "Unauthorized." });
  }

  if (url.pathname === "/internal/stats" && req.method === "GET") {
    const callId = url.searchParams.get("callId") || "";
    const room = rooms.get(callId);
    return json(
      res,
      200,
      room
        ? roomStats(room)
        : {
            participantCount: 0,
            participants: [],
            startedAt: null,
            timerEndsAt: null,
          }
    );
  }

  if (url.pathname === "/internal/broadcast" && req.method === "POST") {
    const body = await readJson(req);
    const room = rooms.get(String(body.callId ?? ""));

    if (room) {
      if (body.event === "call.updated") {
        const custom = body.data?.call?.custom;
        if (custom && typeof custom === "object") {
          updateRoomCustom(room, custom as Record<string, unknown>);
        }
        const limits = body.data?.call?.settings?.limits;
        if (limits) {
          room.maxParticipants = Math.max(2, Math.min(20, Number(limits.max_participants) || room.maxParticipants));
          const nextMinutes = Math.max(1, Math.min(45, Math.round((Number(limits.max_duration_seconds) || room.durationMinutes * 60) / 60)));
          room.durationMinutes = nextMinutes;
          if (room.startedAt) {
            room.timerEndsAt = new Date(room.startedAt.getTime() + nextMinutes * 60_000);
            if (room.durationTimer) clearTimeout(room.durationTimer);
            room.durationTimer = setTimeout(() => endRoom(room), Math.max(1_000, room.timerEndsAt.getTime() - Date.now()));
          }
        }
      }

      broadcast(
        room,
        String(body.event ?? "custom"),
        (body.data ?? {}) as JsonObject,
        body.targetUserId
          ? { targetUserId: String(body.targetUserId) }
          : undefined
      );
    }

    return json(res, 200, { success: true });
  }

  if (url.pathname === "/internal/end" && req.method === "POST") {
    const body = await readJson(req);
    const room = rooms.get(String(body.callId ?? ""));
    if (room) endRoom(room);
    return json(res, 200, { success: true });
  }

  return json(res, 404, { error: "Not found." });
});

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) =>
    protocols.has("cohiva-rtc") ? "cohiva-rtc" : false,
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname !== "/rtc") {
    socket.destroy();
    return;
  }

  if (ALLOWED_ORIGINS.length > 0) {
    const origin = req.headers.origin?.trim() || "";
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  }

  const protocols = String(req.headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const tokenProtocol = protocols.find((value) =>
    value.startsWith("cohiva-token.")
  );
  const tokenValue = tokenProtocol
    ? tokenProtocol.slice("cohiva-token.".length)
    : IS_PRODUCTION
      ? ""
      : url.searchParams.get("token") || "";

  if (!protocols.includes("cohiva-rtc") || !tokenValue) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  try {
    const token = verifyRtcToken(tokenValue, SECRET);
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleSocket(ws, token);
    });
  } catch (error) {
    console.error("RTC token rejected:", error);
    socket.destroy();
  }
});

const start = async () => {
  worker = await mediasoup.createWorker({ logLevel: "warn" });

  worker.on("died", (error: Error) => {
    console.error("mediasoup worker died:", error);
    setTimeout(() => process.exit(1), 1000);
  });

  webRtcServer = await worker.createWebRtcServer({
    listenInfos: [
      {
        protocol: "udp",
        ip: LISTEN_IP,
        announcedAddress: ANNOUNCED_ADDRESS,
        port: MEDIA_PORT,
      },
      {
        protocol: "tcp",
        ip: LISTEN_IP,
        announcedAddress: ANNOUNCED_ADDRESS,
        port: MEDIA_PORT,
      },
    ],
  });

  server.listen(SIGNAL_PORT, "0.0.0.0", () => {
    console.log(`Cohiva RTC signaling: http://127.0.0.1:${SIGNAL_PORT}`);
    console.log(`Cohiva RTC media port: ${MEDIA_PORT} UDP/TCP`);
    console.log(`RTC announced address: ${ANNOUNCED_ADDRESS}`);
    console.log(`RTC TURN fallback: ${TURN_URLS.length ? "configured" : "disabled"}`);
    console.log(`RTC allowed origins: ${ALLOWED_ORIGINS.length || "development/unrestricted"}`);
  });
};

void start().catch((error) => {
  console.error("Unable to start Cohiva RTC server:", error);
  process.exit(1);
});
