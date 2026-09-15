"use client";

import { useEffect, useRef, useState } from "react";

type JoinParticipant = {
  userId: string;
  name: string;
  image?: string;
  isHost?: boolean;
};

type LogLine = {
  at: string;
  text: string;
};

const stamp = () => new Date().toLocaleTimeString();

export default function RtcParallelProbe() {
  const [roomId, setRoomId] = useState("cohiva-rtc-test");
  const [status, setStatus] = useState<
    "idle" | "connecting" | "joined" | "error"
  >("idle");
  const [participants, setParticipants] = useState<JoinParticipant[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const joinRequestIdRef = useRef<string | null>(null);

  const addLog = (text: string) => {
    setLogs((current) => [...current.slice(-19), { at: stamp(), text }]);
  };

  const disconnect = () => {
    const socket = socketRef.current;
    socketRef.current = null;
    joinRequestIdRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "RTC probe disconnected");
    }
    setParticipants([]);
    setStatus("idle");
  };

  useEffect(() => () => socketRef.current?.close(), []);

  const connect = async () => {
    if (status === "connecting" || status === "joined") return;

    const cleanRoomId = roomId.trim();
    if (!cleanRoomId) return;

    setStatus("connecting");
    setParticipants([]);
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

      addLog(`Opening ${endpoint.host}${endpoint.pathname}...`);
      const socket = new WebSocket(endpoint.toString());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        const id = crypto.randomUUID();
        joinRequestIdRef.current = id;
        addLog("Signaling connected. Joining test room...");
        socket.send(
          JSON.stringify({
            type: "request",
            id,
            action: "join",
            data: {},
          })
        );
      });

      socket.addEventListener("message", (event) => {
        let message: any;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (
          message.type === "response" &&
          message.id === joinRequestIdRef.current
        ) {
          if (!message.ok) {
            setStatus("error");
            addLog(`Join failed: ${message.error || "Unknown error"}`);
            return;
          }

          const joined = Array.isArray(message.data?.participants)
            ? (message.data.participants as JoinParticipant[])
            : [];
          setParticipants(joined);
          setStatus("joined");
          addLog(`Joined. ${joined.length} participant(s) in the RTC room.`);
          return;
        }

        if (message.type === "event") {
          if (message.event === "participant-joined" && message.data?.participant) {
            const participant = message.data.participant as JoinParticipant;
            setParticipants((current) => {
              if (current.some((item) => item.userId === participant.userId)) {
                return current;
              }
              return [...current, participant];
            });
          }

          if (message.event === "participant-left" && message.data?.userId) {
            setParticipants((current) =>
              current.filter((item) => item.userId !== message.data.userId)
            );
          }

          addLog(`Event: ${String(message.event)}`);
        }
      });

      socket.addEventListener("error", () => {
        setStatus("error");
        addLog("WebSocket connection error.");
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current === socket) socketRef.current = null;
        if (status !== "idle") {
          setStatus((current) => (current === "error" ? current : "idle"));
        }
        addLog(`RTC socket closed (${event.code}).`);
      });
    } catch (error) {
      setStatus("error");
      addLog(error instanceof Error ? error.message : "RTC connection failed.");
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-90px)] w-full max-w-4xl flex-col gap-6 px-4 py-10 text-[#3B3732] sm:px-6">
      <section className="rounded-[28px] border border-[#3B3732]/10 bg-[#FFF9EF] p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A2AB73]">
            Stream stays enabled
          </p>
          <h1 className="mt-2 text-3xl font-black">Cohiva RTC parallel test</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#6E655B]">
            This page tests Cohiva&apos;s own signaling server beside the existing
            Stream meeting stack. It does not replace your working meetings yet.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
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
              onClick={disconnect}
              className="h-12 rounded-2xl bg-[#3B3732] px-6 font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={status === "connecting"}
              className="h-12 rounded-2xl bg-[#CF3864] px-6 font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60"
            >
              {status === "connecting" ? "Connecting..." : "Connect RTC"}
            </button>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3 text-sm font-bold">
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
          {status === "joined"
            ? "Cohiva RTC signaling connected"
            : status === "error"
              ? "RTC test encountered an error"
              : status === "connecting"
                ? "Connecting to Cohiva RTC..."
                : "Not connected"}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[24px] border border-[#3B3732]/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Participants</h2>
          <div className="mt-4 space-y-2">
            {participants.length ? (
              participants.map((participant) => (
                <div
                  key={participant.userId}
                  className="rounded-2xl bg-[#F7F0E5] px-4 py-3"
                >
                  <p className="font-bold">{participant.name}</p>
                  <p className="truncate text-xs text-[#7A7067]">
                    {participant.userId}
                  </p>
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
