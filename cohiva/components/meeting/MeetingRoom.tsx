"use client";

import {
  COHIVA_DEFAULT_DURATION_MINUTES,
  COHIVA_DEFAULT_PARTICIPANTS,
} from "@/lib/cohivaMeetingConfig";
import { useUser } from "@/components/providers/AuthProvider";
import { CohivaRtcProvider, useCohivaRtc } from "@/components/rtc/CohivaRtcProvider";
import CohivaRtcStage from "@/components/rtc/CohivaRtcStage";
import CohivaRtcControls from "@/components/rtc/CohivaRtcControls";
import CohivaRecordingControl from "@/components/rtc/CohivaRecordingControl";
import CohivaRtcDeviceSettings from "@/components/rtc/CohivaRtcDeviceSettings";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useSmartPolling } from "@/lib/useSmartPolling";
import CohivaWhiteboard from "./CohivaWhiteboard";
import CohivaLeaveCallControl from "./CohivaLeaveCallControl";
import MeetingConnectionStatus from "./MeetingConnectionStatus";
import MeetingPermissionsPanel, {
  DEFAULT_COHIVA_PERMISSIONS,
  type CohivaPermissions,
} from "./MeetingPermissionsPanel";
import MeetingCaptionsOverlay from "./MeetingCaptionsOverlay";
import MeetingSessionTimer from "./MeetingSessionTimer";
import MeetingAccessSettings from "./MeetingAccessSettings";
import MeetingLimitsSettings from "./MeetingLimitsSettings";
import MeetingJoinRequests from "./MeetingJoinRequests";
import type { AccessibilitySettings } from "./meetingAccessibilityTypes";

const MeetingParticipantsPanel = dynamic(() => import("./MeetingParticipantsPanel"));
const MeetingChatPanel = dynamic(() => import("./MeetingChatPanel"));
const MeetingAttendancePanel = dynamic(() => import("./MeetingAttendancePanel"));
const MeetingAccessibilityPanel = dynamic(() => import("./MeetingAccessibilityPanel"));

type MeetingRoomProps = { callId: string; shouldCreate: boolean };
type MeetingView = "video" | "whiteboard";
type MeetingAccessMode = "open" | "approval" | "locked";
type AccessStatus = "idle" | "requesting" | "waiting" | "approved" | "denied";

type RoomMetadata = {
  callId: string;
  hostUserId: string;
  teacher: boolean;
  kind: "instant" | "scheduled" | "personal";
  title: string;
  description: string;
  startsAt: string | null;
  startedAt: string | null;
  timerEndsAt: string | null;
  accessMode: MeetingAccessMode;
  durationMinutes: number;
  maxParticipants: number;
  endedAt: string | null;
  permissions?: Partial<CohivaPermissions>;
};

type FloatingReaction = { id: string; emoji: string; name: string };
type ChatNotification = { senderId: string; senderName: string; senderImage: string; text: string };
type RaisedHandInfo = { userId: string; name: string; image: string; raisedAt: string };

const MeetingRoom = ({ callId, shouldCreate }: MeetingRoomProps) => {
  const { user } = useUser();
  const [room, setRoom] = useState<RoomMetadata | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const initialize = async () => {
      try {
        setLoading(true);
        setError("");
        if (shouldCreate) {
          const createResponse = await fetch("/api/meetings/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "instant",
              callId,
              durationMinutes: COHIVA_DEFAULT_DURATION_MINUTES,
              maxParticipants: COHIVA_DEFAULT_PARTICIPANTS,
            }),
          });
          const createResult = await createResponse.json();
          if (!createResponse.ok) throw new Error(createResult.error || "Cohiva could not create this meeting.");
        }

        const response = await fetch(`/api/meetings/room?callId=${encodeURIComponent(callId)}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "This meeting could not be found.");
        if (!cancelled) setRoom(result.room);
      } catch (initializationError) {
        if (!cancelled) setError(initializationError instanceof Error ? initializationError.message : "Unable to open this meeting.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [callId, shouldCreate, user?.id]);

  if (loading || !user) return <MeetingLoading text="Connecting to Cohiva..." />;
  if (error) return <MeetingError message={error} />;
  if (!room) return <MeetingLoading text="Finding your Cohiva room..." />;
  if (room.endedAt) return <MeetingError message="This Cohiva meeting has already ended." />;

  if (!joined) {
    return <MeetingLobby callId={callId} room={room} onJoined={() => setJoined(true)} />;
  }

  return (
    <CohivaRtcProvider callId={callId}>
      <MeetingConnectionStatus />
      <LiveMeeting callId={callId} initialPermissions={room.permissions} />
    </CohivaRtcProvider>
  );
};

export default MeetingRoom;

const MeetingLobby = ({ callId, room, onJoined }: { callId: string; room: RoomMetadata; onJoined: () => void }) => {
  const router = useRouter();
  const { user } = useUser();
  const [accessMode, setAccessMode] = useState<MeetingAccessMode>(room.accessMode || "approval");
  const [meetingStarted, setMeetingStarted] = useState(Boolean(room.startedAt));
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [selectedMicrophone, setSelectedMicrophone] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const joiningRef = useRef(false);
  const mediaAvailable = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  const stopPreview = useCallback(() => {
    previewStreamRef.current?.getTracks().forEach((track) => track.stop());
    previewStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((item) => item.kind === "videoinput");
      const microphones = devices.filter((item) => item.kind === "audioinput");
      const speakers = devices.filter((item) => item.kind === "audiooutput");
      setCameraDevices(cameras); setMicrophoneDevices(microphones); setSpeakerDevices(speakers);
      if (!selectedCamera && cameras[0]) setSelectedCamera(cameras[0].deviceId);
      if (!selectedMicrophone && microphones[0]) setSelectedMicrophone(microphones[0].deviceId);
      if (!selectedSpeaker && speakers[0]) setSelectedSpeaker(speakers[0].deviceId);
    } catch {}
  }, [selectedCamera, selectedMicrophone, selectedSpeaker]);

  useEffect(() => { void refreshDevices(); return stopPreview; }, [refreshDevices, stopPreview]);

  const toggleCamera = async () => {
    if (!mediaAvailable) { setError("Camera access is not supported on this device/browser origin."); return; }
    if (cameraOn) { stopPreview(); return; }
    try {
      setError("");
      stopPreview();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamera ? { deviceId: { exact: selectedCamera }, width: { ideal: 1280 }, height: { ideal: 720 } } : true,
        audio: false,
      });
      previewStreamRef.current = stream;
      if (previewRef.current) { previewRef.current.srcObject = stream; await previewRef.current.play().catch(() => {}); }
      setCameraOn(true);
      await refreshDevices();
    } catch (cameraError) {
      setError(cameraError instanceof Error ? cameraError.message : "Cohiva could not access your camera.");
    }
  };

  const toggleMicrophone = async () => {
    if (!mediaAvailable) { setError("Microphone access is not supported on this device/browser origin."); return; }
    if (microphoneOn) { setMicrophoneOn(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: selectedMicrophone ? { deviceId: { exact: selectedMicrophone } } : true, video: false });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophoneOn(true);
      await refreshDevices();
    } catch (micError) {
      setError(micError instanceof Error ? micError.message : "Cohiva could not access your microphone.");
    }
  };

  const loadAccess = useCallback(async () => {
    try {
      const response = await fetch(`/api/meetings/access?callId=${encodeURIComponent(callId)}`, { cache: "no-store" });
      const result = await response.json();

      if (response.status === 410 || result?.ended) {
        setMeetingStarted(false);
        setAccessStatus("denied");
        setError("This Cohiva meeting has ended.");
        return;
      }

      if (response.ok) {
        const nextMode = result.mode === "open" || result.mode === "locked" ? result.mode : "approval";
        setAccessMode(nextMode);
        setMeetingStarted(Boolean(result.started));
        if (nextMode === "open") {
          setAccessStatus((current) => current === "denied" ? "idle" : current);
          setError((current) => current.includes("did not approve") ? "" : current);
        }
      }
    } catch {}
  }, [callId]);

  useSmartPolling(loadAccess, { enabled: !room.teacher, intervalMs: 2500 });

  /* Restore waiting-room/admission state after a refresh. */
  useEffect(() => {
    if (room.teacher) return;
    let cancelled = false;

    const restoreAccessState = async () => {
      try {
        const response = await fetch(
          `/api/meetings/join-request?callId=${encodeURIComponent(callId)}&scope=mine`,
          { cache: "no-store" }
        );
        const result = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.status === 410 || result?.ended) {
          setAccessStatus("denied");
          setError("This Cohiva meeting has ended.");
          return;
        }

        if (!response.ok || !result) return;
        setMeetingStarted(Boolean(result.started));
        if (result.accessMode === "open" || result.accessMode === "locked" || result.accessMode === "approval") {
          setAccessMode(result.accessMode);
        }

        if (result.status === "pending") {
          setAccessStatus("waiting");
        } else if (result.status === "approved" || result.admitted === true) {
          setAccessStatus("approved");
        } else if (result.status === "denied") {
          setAccessStatus("denied");
          setError("The host did not approve this join request.");
        }
      } catch {}
    };

    void restoreAccessState();
    return () => {
      cancelled = true;
    };
  }, [callId, room.teacher]);

  const finishJoin = useCallback(async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    try {
      const membership = await fetch("/api/meetings/member", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId }),
      });
      const membershipResult = await membership.json().catch(() => null);
      if (!membership.ok) throw new Error(membershipResult?.error || "Unable to enter the meeting.");
      window.sessionStorage.setItem(`cohiva-rtc-prejoin:${callId}`, JSON.stringify({
        microphone: microphoneOn,
        camera: cameraOn,
        audioDeviceId: selectedMicrophone,
        videoDeviceId: selectedCamera,
        audioOutputDeviceId: selectedSpeaker,
      }));
      stopPreview();
      setAccessStatus("approved");
      onJoined();
    } catch (joinError) {
      joiningRef.current = false;
      setAccessStatus("idle");
      setError(joinError instanceof Error ? joinError.message : "Unable to enter the meeting.");
    }
  }, [callId, cameraOn, microphoneOn, onJoined, selectedCamera, selectedMicrophone, selectedSpeaker, stopPreview]);

  const checkWaitingStatus = useCallback(async () => {
    if (accessStatus !== "waiting") return;
    try {
      const response = await fetch(`/api/meetings/join-request?callId=${encodeURIComponent(callId)}&scope=mine`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 410 || result?.ended) {
        setAccessStatus("denied");
        setError("This Cohiva meeting has ended.");
        return;
      }
      if (!response.ok) return;
      setMeetingStarted(Boolean(result.started));
      if (result.status === "approved" && result.started) await finishJoin();
      if (result.status === "approved" && !result.started) setAccessStatus("approved");
      if (result.status === "denied") { setAccessStatus("denied"); setError("The host did not approve this join request."); }
    } catch {}
  }, [accessStatus, callId, finishJoin]);

  useSmartPolling(checkWaitingStatus, { enabled: accessStatus === "waiting", intervalMs: 1200 });

  useEffect(() => {
    if (accessStatus === "waiting" && accessMode === "open" && meetingStarted) {
      void finishJoin();
    }
    if (accessStatus === "waiting" && accessMode === "locked") {
      setAccessStatus("idle");
      setError("The host locked this meeting.");
    }
  }, [accessMode, accessStatus, finishJoin, meetingStarted]);

  const joinMeeting = async () => {
    if (!user || joiningRef.current) return;
    setError("");
    if (room.teacher) { await finishJoin(); return; }
    if (accessMode === "locked" && accessStatus !== "approved") {
      setError("This meeting is currently locked by the host.");
      return;
    }
    if (accessStatus === "approved") {
      if (!meetingStarted) {
        setError("You are approved. Waiting for the host to start the meeting.");
        return;
      }
      await finishJoin();
      return;
    }
    if (accessMode === "open") {
      if (!meetingStarted) {
        setAccessStatus("waiting");
        setError("Waiting for the host to start the meeting.");
        return;
      }
      await finishJoin();
      return;
    }
    try {
      setAccessStatus("requesting");
      const response = await fetch("/api/meetings/join-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, action: "request", name: user.fullName || user.username || user.firstName || "Participant", image: user.imageUrl || "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send join request.");
      if ((result.status === "approved" || result.status === "open") && result.started !== false) { await finishJoin(); return; }
      if (result.status === "approved") {
        setAccessStatus("approved");
        setError("You are approved. Waiting for the host to start the meeting.");
        return;
      }
      setAccessStatus("waiting");
      if (result.status === "waiting-host") {
        setError("Waiting for the host to start the meeting.");
      }
    } catch (requestError) {
      setAccessStatus("idle");
      setError(requestError instanceof Error ? requestError.message : "Unable to send join request.");
    }
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/meeting/${callId}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setError("Unable to copy meeting link."); }
  };

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#F9F0E0] p-3 sm:p-6">
      <div className="grid w-full max-w-[1450px] overflow-hidden rounded-[30px] bg-[#FFF7EB] shadow-[0_30px_90px_rgba(61,55,50,0.16)] lg:min-h-[720px] lg:grid-cols-[1.15fr_0.9fr]">
        <section className="relative min-h-[300px] overflow-hidden bg-[#302B27] lg:min-h-0">
          <div className="absolute left-5 top-5 z-30 rounded-full bg-[#CC3A63] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white">Cohiva Preview</div>
          <video ref={previewRef} muted playsInline className={`h-full w-full object-cover ${cameraOn ? "block" : "hidden"}`} />
          {!cameraOn && <div className="absolute inset-0 flex items-center justify-center text-center text-white"><div><div className="text-5xl">📷</div><p className="mt-4 text-xl font-black">Camera is off</p></div></div>}
        </section>
        <section className="overflow-y-auto p-5 sm:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#A2AB73]">Ready to meet?</p>
          <h1 className="mt-2 text-3xl font-black text-[#3D3732]">{room.teacher ? "Start your classroom ✨" : "Join the classroom ✨"}</h1>
          <p className="mt-2 text-sm text-[#756E64]">{room.title || "Cohiva Meeting"}</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => void toggleMicrophone()} className={`rounded-2xl p-4 font-black ${microphoneOn ? "bg-[#A2AB73] text-white" : "bg-[#403A35]/10 text-[#3D3732]"}`}>🎙 {microphoneOn ? "Mic on" : "Mic off"}</button>
            <button type="button" onClick={() => void toggleCamera()} className={`rounded-2xl p-4 font-black ${cameraOn ? "bg-[#A2AB73] text-white" : "bg-[#403A35]/10 text-[#3D3732]"}`}>📷 {cameraOn ? "Camera on" : "Camera off"}</button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <select value={selectedMicrophone} onChange={(event) => setSelectedMicrophone(event.target.value)} className="rounded-xl border border-[#403A35]/10 bg-white p-3 text-xs"><option value="">Default microphone</option>{microphoneDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select>
            <select value={selectedCamera} onChange={(event) => { setSelectedCamera(event.target.value); if (cameraOn) void toggleCamera().then(() => toggleCamera()); }} className="rounded-xl border border-[#403A35]/10 bg-white p-3 text-xs"><option value="">Default camera</option>{cameraDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select>
            <select value={selectedSpeaker} onChange={(event) => setSelectedSpeaker(event.target.value)} className="rounded-xl border border-[#403A35]/10 bg-white p-3 text-xs"><option value="">Default speaker</option>{speakerDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}</select>
          </div>

          {room.teacher && <div className="mt-5 space-y-4"><MeetingAccessSettings callId={callId} /><MeetingLimitsSettings callId={callId} compact /></div>}

          {accessStatus === "waiting" && <div className="mt-5 rounded-2xl bg-[#A2AB73]/15 p-4 text-sm font-bold text-[#66703F]">{accessMode === "open" && !meetingStarted ? "Waiting for the host to start the meeting…" : "Waiting for the host to approve your request…"}</div>}
          {accessStatus === "approved" && !meetingStarted && <div className="mt-5 rounded-2xl bg-[#A2AB73]/15 p-4 text-sm font-bold text-[#66703F]">Approved ✓ Waiting for the host to start the meeting…</div>}
          {error && <div className="mt-5 rounded-2xl bg-[#CC3A63]/10 p-4 text-sm font-bold text-[#CC3A63]">{error}</div>}

          <button type="button" disabled={accessStatus === "requesting" || accessStatus === "waiting" || accessStatus === "denied"} onClick={() => void joinMeeting()} className="mt-6 w-full rounded-2xl bg-[#CC3A63] px-5 py-4 font-black text-white disabled:opacity-50">
            {accessStatus === "requesting"
              ? "Requesting…"
              : accessStatus === "waiting"
                ? accessMode === "open" && !meetingStarted ? "Waiting for host" : "Waiting for approval"
                : room.teacher
                  ? room.startedAt ? "Rejoin meeting" : "Start meeting"
                  : accessStatus === "approved"
                    ? meetingStarted ? "Join meeting" : "Approved — waiting for host"
                    : accessMode === "approval"
                      ? "Ask to join"
                      : meetingStarted ? "Join meeting" : "Waiting for host"}
          </button>
          <div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={() => void copyInvite()} className="rounded-2xl bg-[#403A35]/10 p-3 text-xs font-black">{copied ? "Copied ✓" : "Copy invite"}</button><button type="button" onClick={() => router.replace("/")} className="rounded-2xl bg-[#403A35]/10 p-3 text-xs font-black">Back home</button></div>
        </section>
      </div>
    </main>
  );
};

const LiveMeeting = ({ callId, initialPermissions }: { callId: string; initialPermissions?: Partial<CohivaPermissions> }) => {
  const router = useRouter();
  const rtc = useCohivaRtc();
  const { user } = useUser();
  const userId = user?.id || "";
  const userName = user?.fullName || user?.username || user?.firstName || "Participant";
  const userImage = user?.imageUrl || "";
  const teacher = rtc.selfRole === "host";


  const [permissions, setPermissions] = useState<CohivaPermissions>({ ...DEFAULT_COHIVA_PERMISSIONS, ...initialPermissions, studentRecording: false });
  const [activeView, setActiveView] = useState<MeetingView>("video");
  const [whiteboardMounted, setWhiteboardMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [myHandRaised, setMyHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [raisedHandDetails, setRaisedHandDetails] = useState<Map<string, RaisedHandInfo>>(new Map());
  const [raisedHandsOpen, setRaisedHandsOpen] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatNotification, setChatNotification] = useState<ChatNotification | null>(null);
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>({ captionsVisible: false, captionSize: "medium", highContrast: false, reduceMotion: false, hideReactions: false });

  useLayoutEffect(() => { if (activeView === "whiteboard") setWhiteboardMounted(true); }, [activeView]);

  useEffect(() => {
    if (rtc.status !== "ended") return;
    if (teacher && (rtc.recordingActive || rtc.recordingSaving)) return;

    if (teacher) {
      void fetch("/api/meetings/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
        keepalive: true,
      }).catch(() => {});
    }

    const timer = window.setTimeout(() => router.replace("/"), 700);
    return () => window.clearTimeout(timer);
  }, [
    callId,
    router,
    rtc.recordingActive,
    rtc.recordingSaving,
    rtc.status,
    teacher,
  ]);

  useEffect(() => {
    try { const saved = window.localStorage.getItem("cohiva-accessibility"); if (saved) setAccessibility((current) => ({ ...current, ...JSON.parse(saved) })); } catch {}
  }, []);
  useEffect(() => { try { window.localStorage.setItem("cohiva-accessibility", JSON.stringify(accessibility)); } catch {} }, [accessibility]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/meetings/permissions?callId=${encodeURIComponent(callId)}`, { cache: "no-store" });
        const result = await response.json();
        if (response.ok && active) setPermissions({ ...DEFAULT_COHIVA_PERMISSIONS, ...(result.permissions || {}), studentRecording: false });
      } catch {}
    };
    void load();
    return () => { active = false; };
  }, [callId]);

  useEffect(() => rtc.subscribeEvent("call.updated", (data) => {
    const next = data?.call?.custom?.cohiva_permissions;
    if (next && typeof next === "object") setPermissions({ ...DEFAULT_COHIVA_PERMISSIONS, ...next, studentRecording: false });
  }), [rtc]);

  useEffect(() => {
    if (!userId || rtc.status !== "joined") return;
    const payload = { callId, name: userName, image: userImage };
    const post = (action: "join" | "leave" | "heartbeat", keepalive = false) => fetch("/api/meetings/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, action }), keepalive });
    void post("join").catch(() => {});
    const heartbeat = window.setInterval(() => void post("heartbeat").catch(() => {}), 20_000);
    const pageHide = () => void post("leave", true).catch(() => {});
    window.addEventListener("pagehide", pageHide);
    return () => { window.clearInterval(heartbeat); window.removeEventListener("pagehide", pageHide); void post("leave", true).catch(() => {}); };
  }, [callId, rtc.status, userId, userImage, userName]);

  const sendClassroomEvent = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/meetings/classroom-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId, senderName: userName, senderImage: userImage, ...payload }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Unable to send classroom event.");
  }, [callId, userImage, userName]);

  useEffect(() => rtc.subscribeEvent("custom", (data) => {
    const payload = data.custom as Record<string, any> | undefined;
    if (!payload) return;
    if (payload.type === "cohiva-classroom") {
      if (payload.action === "hand") {
        const senderId = typeof payload.senderId === "string" ? payload.senderId : "";
        if (!senderId) return;
        const raised = payload.raised === true;
        setRaisedHands((current) => { const next = new Set(current); raised ? next.add(senderId) : next.delete(senderId); return next; });
        setRaisedHandDetails((current) => { const next = new Map(current); if (raised) next.set(senderId, { userId: senderId, name: typeof payload.senderName === "string" ? payload.senderName : "Participant", image: typeof payload.senderImage === "string" ? payload.senderImage : "", raisedAt: typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString() }); else next.delete(senderId); return next; });
      }
      if (payload.action === "reaction" && typeof payload.emoji === "string") {
        const reaction = { id: typeof payload.eventId === "string" ? payload.eventId : `${Date.now()}-${Math.random()}`, emoji: payload.emoji, name: typeof payload.senderName === "string" ? payload.senderName : "Participant" };
        setFloatingReactions((current) => [...current.slice(-4), reaction]);
        window.setTimeout(() => setFloatingReactions((current) => current.filter((item) => item.id !== reaction.id)), 3000);
      }
    }
    if (payload.type === "cohiva-chat") {
      const senderId = typeof payload.senderId === "string" ? payload.senderId : "";
      if (!senderId || senderId === userId || chatOpen) return;
      setChatUnreadCount((current) => Math.min(current + 1, 99));
      setChatNotification({ senderId, senderName: typeof payload.senderName === "string" ? payload.senderName : "Participant", senderImage: typeof payload.senderImage === "string" ? payload.senderImage : "", text: typeof payload.text === "string" ? payload.text : "New message" });
    }
  }), [chatOpen, rtc, userId]);

  useEffect(() => { if (chatOpen) { setChatUnreadCount(0); setChatNotification(null); } }, [chatOpen]);
  useEffect(() => rtc.subscribeEvent("participant-left", (data) => {
    const leavingId = typeof data.userId === "string" ? data.userId : "";
    if (!leavingId) return;
    setRaisedHands((current) => { const next = new Set(current); next.delete(leavingId); return next; });
    setRaisedHandDetails((current) => { const next = new Map(current); next.delete(leavingId); return next; });
  }), [rtc]);

  const toggleHand = async () => {
    const next = !myHandRaised; setMyHandRaised(next);
    try { await sendClassroomEvent({ action: "hand", raised: next }); } catch { setMyHandRaised(!next); }
  };
  const sendReaction = async (emoji: string) => { setReactionMenuOpen(false); try { await sendClassroomEvent({ action: "reaction", emoji }); } catch {} };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable || !event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "m") { event.preventDefault(); void rtc.toggleMicrophone(); }
      if (key === "v") { event.preventDefault(); void rtc.toggleCamera(); }
      if (key === "c") { event.preventDefault(); setChatOpen((current) => !current); }
      if (key === "h") { event.preventDefault(); void toggleHand(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const copyInvite = async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/meeting/${callId}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch {} };

  return (
    <main className={`relative flex h-dvh w-full flex-col overflow-hidden bg-[#24211F] text-white ${accessibility.highContrast ? "contrast-125" : ""}`}>
      <header className="flex h-[64px] shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#302B27] px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2"><button type="button" onClick={() => setParticipantsOpen(true)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black">👥 {rtc.participants.length}/{rtc.maxParticipants}</button><MeetingSessionTimer />{rtc.recordingActive && <div className="flex items-center gap-1.5 rounded-lg bg-[#CC3A63] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />Recording</div>}{raisedHands.size > 0 && <button type="button" onClick={() => setRaisedHandsOpen((current) => !current)} className="rounded-lg bg-[#FACC15] px-3 py-2 text-xs font-black text-[#403A35]">✋ {raisedHands.size}</button>}<div className="flex rounded-xl bg-black/20 p-1"><button type="button" onClick={() => setActiveView("video")} className={`rounded-lg px-3 py-1.5 text-xs font-black ${activeView === "video" ? "bg-[#FFF7EB] text-[#403A35]" : "text-white/60"}`}>🎥 Video</button><button type="button" onClick={() => setActiveView("whiteboard")} className={`rounded-lg px-3 py-1.5 text-xs font-black ${activeView === "whiteboard" ? "bg-[#A2AB73]" : "text-white/60"}`}>✏ Board</button></div></div>
        <div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => setChatOpen(true)} className="relative rounded-lg bg-white/10 px-3 py-2 text-xs">💬{chatUnreadCount > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-[#CC3A63] px-1.5 text-[8px] font-black">{chatUnreadCount}</span>}</button><button type="button" onClick={() => void toggleHand()} className={`rounded-lg px-3 py-2 text-xs ${myHandRaised ? "bg-[#FACC15] text-[#403A35]" : "bg-white/10"}`}>✋</button><div className="relative"><button type="button" onClick={() => setReactionMenuOpen((current) => !current)} className="rounded-lg bg-white/10 px-3 py-2 text-xs">😀</button>{reactionMenuOpen && <div className="absolute right-0 top-[44px] z-[230] flex gap-1 rounded-2xl bg-[#FFF7EB] p-2 shadow-2xl">{["👍","👏","❤️","😂","🎉"].map((emoji) => <button key={emoji} type="button" onClick={() => void sendReaction(emoji)} className="h-10 w-10 rounded-xl text-xl">{emoji}</button>)}</div>}</div><button type="button" onClick={() => setDeviceSettingsOpen(true)} className="rounded-lg bg-white/10 px-3 py-2 text-xs">🎛</button><button type="button" onClick={() => setAccessibilityOpen(true)} className="rounded-lg bg-white/10 px-3 py-2 text-xs">♿</button>{teacher && <button type="button" onClick={() => setAttendanceOpen(true)} className="rounded-lg bg-white/10 px-3 py-2 text-xs">📋</button>}{teacher && <button type="button" onClick={() => setPermissionsOpen(true)} className="rounded-lg bg-[#A2AB73]/20 px-3 py-2 text-xs">⚙</button>}<button type="button" onClick={() => void copyInvite()} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black">{copied ? "✓" : "Invite"}</button></div>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3"><div className="relative h-full overflow-hidden rounded-[20px] bg-[#181614]"><div className={`absolute inset-0 ${activeView === "video" ? "visible opacity-100" : "invisible pointer-events-none opacity-0"}`}><CohivaRtcStage /></div>{whiteboardMounted && <div className={`absolute inset-0 ${activeView === "whiteboard" ? "visible opacity-100" : "invisible pointer-events-none opacity-0"}`}><CohivaWhiteboard callId={callId} active={activeView === "whiteboard"} /></div>}<MeetingCaptionsOverlay visible={accessibility.captionsVisible} size={accessibility.captionSize} />{!accessibility.hideReactions && <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[80] flex flex-col items-center gap-2">{floatingReactions.map((reaction) => <div key={reaction.id} className="rounded-full bg-[#FFF7EB] px-4 py-2 text-sm font-black text-[#403A35]"><span className="mr-2 text-xl">{reaction.emoji}</span>{reaction.name}</div>)}</div>}</div></section>

      <footer className="flex h-[76px] shrink-0 items-center justify-center border-t border-white/10 bg-[#302B27] px-3"><div className="flex items-center gap-2"><CohivaRtcControls onOpenDevices={() => setDeviceSettingsOpen(true)} /><CohivaRecordingControl /><CohivaLeaveCallControl /></div></footer>

      {teacher && <MeetingJoinRequests callId={callId} />}
      <MeetingPermissionsPanel callId={callId} open={permissionsOpen} onClose={() => setPermissionsOpen(false)} />
      {participantsOpen && <MeetingParticipantsPanel open onClose={() => setParticipantsOpen(false)} raisedHands={raisedHands} classPermissions={permissions} />}
      {chatOpen && <MeetingChatPanel open onClose={() => setChatOpen(false)} callId={callId} />}
      {teacher && attendanceOpen && <MeetingAttendancePanel open onClose={() => setAttendanceOpen(false)} callId={callId} />}
      {accessibilityOpen && <MeetingAccessibilityPanel open onClose={() => setAccessibilityOpen(false)} settings={accessibility} onChange={setAccessibility} />}
      <CohivaRtcDeviceSettings open={deviceSettingsOpen} onClose={() => setDeviceSettingsOpen(false)} />

      {chatNotification && !chatOpen && <button type="button" onClick={() => setChatOpen(true)} className="fixed bottom-24 right-4 z-[350] max-w-[320px] rounded-2xl bg-[#FFF7EB] p-4 text-left text-[#3D3732] shadow-2xl"><p className="text-xs font-black">{chatNotification.senderName}</p><p className="mt-1 line-clamp-2 text-[11px] text-[#756E64]">{chatNotification.text}</p></button>}
      {raisedHandsOpen && <div className="fixed left-4 top-[74px] z-[340] w-[300px] rounded-2xl bg-[#FFF7EB] p-4 text-[#3D3732] shadow-2xl"><div className="flex items-center justify-between"><p className="font-black">Raised hands</p><button type="button" onClick={() => setRaisedHandsOpen(false)}>×</button></div><div className="mt-3 space-y-2">{Array.from(raisedHandDetails.values()).map((item) => <div key={item.userId} className="rounded-xl bg-[#F9F0E0] p-3 text-xs font-bold">✋ {item.name}</div>)}</div></div>}
    </main>
  );
};

const MeetingLoading = ({ text }: { text: string }) => <main className="flex h-dvh items-center justify-center bg-[#F9F0E0]"><div className="text-center"><div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" /><p className="mt-5 font-bold text-[#756E64]">{text}</p></div></main>;

const MeetingError = ({ message }: { message: string }) => { const router = useRouter(); return <main className="flex h-dvh items-center justify-center bg-[#F9F0E0] p-5"><div className="w-full max-w-md rounded-[28px] bg-[#FFF7EB] p-8 text-center shadow-xl"><div className="text-4xl">⚠️</div><h1 className="mt-4 text-2xl font-black text-[#3D3732]">Unable to open meeting</h1><p className="mt-3 text-sm leading-6 text-[#756E64]">{message}</p><button type="button" onClick={() => router.replace("/")} className="mt-6 rounded-2xl bg-[#CC3A63] px-6 py-3 font-black text-white">Back to dashboard</button></div></main>; };
