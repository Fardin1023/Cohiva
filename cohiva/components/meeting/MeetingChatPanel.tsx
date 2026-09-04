"use client";

import {
  useCall,
} from "@stream-io/video-react-sdk";

import type {
  CustomVideoEvent,
  StreamVideoEvent,
} from "@stream-io/video-react-sdk";

import {
  useUser,
} from "@clerk/nextjs";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

/* =========================================================
   TYPES
========================================================= */

type MeetingChatPanelProps = {
  open: boolean;
  onClose: () => void;
  callId: string;
};

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderImage: string;
  text: string;
  sentAt: string;
};

/* =========================================================
   SETTINGS
========================================================= */

const CHAT_EVENT =
  "cohiva-chat";

/* =========================================================
   CHAT PANEL
========================================================= */

const MeetingChatPanel = ({
  open,
  onClose,
  callId,
}: MeetingChatPanelProps) => {
  const call =
    useCall();

  const {
    user,
  } =
    useUser();

  const currentUserId =
    user?.id;

  /* =====================================================
     STATE
  ===================================================== */

  const [
    messages,
    setMessages,
  ] =
    useState<
      ChatMessage[]
    >([]);

  const [
    text,
    setText,
  ] =
    useState("");

  const [
    sending,
    setSending,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  /* =====================================================
     REFS
  ===================================================== */

  const loadedRef =
    useRef(false);

  const bottomRef =
    useRef<HTMLDivElement | null>(
      null
    );

  /* =====================================================
     ADD MESSAGE
  ===================================================== */

  const addMessage =
    (
      message:
        ChatMessage
    ) => {
      setMessages(
        (
          current
        ) => {
          const exists =
            current.some(
              (
                existing
              ) =>
                existing.id ===
                message.id
            );

          if (exists) {
            return current;
          }

          return [
            ...current,
            message,
          ];
        }
      );
    };

  /* =====================================================
     LOAD CHAT HISTORY
  ===================================================== */

  useEffect(() => {
    if (
      !open ||
      loadedRef.current
    ) {
      return;
    }

    const loadMessages =
      async () => {
        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          const response =
            await fetch(
              `/api/meetings/chat?callId=${encodeURIComponent(
                callId
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          const result =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              result.error ||
                "Unable to load chat."
            );
          }

          setMessages(
            Array.isArray(
              result.messages
            )
              ? result.messages
              : []
          );

          loadedRef.current =
            true;
        } catch (
          loadError
        ) {
          console.error(
            "Chat load error:",
            loadError
          );

          setError(
            "Unable to load chat."
          );
        } finally {
          setLoading(
            false
          );
        }
      };

    void loadMessages();
  }, [
    open,
    callId,
  ]);

  /* =====================================================
     RECEIVE LIVE CHAT EVENTS
  ===================================================== */

  useEffect(() => {
    if (!call) {
      return;
    }

    const unsubscribe =
      call.on(
        "custom",
        (
          event:
            StreamVideoEvent
        ) => {
          const customEvent =
            event as
              CustomVideoEvent;

          const payload =
            customEvent.custom as
              Record<
                string,
                unknown
              >;

          if (
            payload.type !==
            CHAT_EVENT
          ) {
            return;
          }

          if (
            typeof payload.id !==
              "string" ||
            typeof payload.senderId !==
              "string" ||
            typeof payload.text !==
              "string" ||
            typeof payload.sentAt !==
              "string"
          ) {
            return;
          }

          addMessage({
            id:
              payload.id,

            senderId:
              payload.senderId,

            senderName:
              typeof payload.senderName ===
              "string"
                ? payload.senderName
                : "Participant",

            senderImage:
              typeof payload.senderImage ===
              "string"
                ? payload.senderImage
                : "",

            text:
              payload.text,

            sentAt:
              payload.sentAt,
          });
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
  ]);

  /* =====================================================
     SCROLL TO NEWEST MESSAGE
  ===================================================== */

  useEffect(() => {
    if (!open) {
      return;
    }

    bottomRef.current?.scrollIntoView({
      behavior:
        "smooth",
    });
  }, [
    messages,
    open,
  ]);

  /* =====================================================
     SEND MESSAGE
  ===================================================== */

  const sendMessage =
    async (
      event:
        FormEvent<HTMLFormElement>
    ) => {
      event.preventDefault();

      const cleanText =
        text.trim();

      if (
        !cleanText ||
        !user ||
        sending
      ) {
        return;
      }

      try {
        setSending(
          true
        );

        setError(
          ""
        );

        const response =
          await fetch(
            "/api/meetings/chat",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  callId,

                  text:
                    cleanText,

                  senderName:
                    user.fullName ||
                    user.username ||
                    user.firstName ||
                    "Participant",

                  senderImage:
                    user.imageUrl ||
                    "",
                }),
            }
          );

        const result =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            result.error ||
              "Unable to send message."
          );
        }

        if (
          result.message
        ) {
          addMessage(
            result.message
          );
        }

        setText(
          ""
        );
      } catch (
        sendError
      ) {
        console.error(
          "Send chat error:",
          sendError
        );

        setError(
          "Message could not be sent."
        );
      } finally {
        setSending(
          false
        );
      }
    };

  /* =====================================================
     HIDDEN
  ===================================================== */

  if (!open) {
    return null;
  }

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="fixed inset-0 z-[220] bg-black/45 backdrop-blur-sm">

      {/* BACKDROP */}

      <button
        type="button"
        onClick={
          onClose
        }
        aria-label="Close chat"
        className="absolute inset-0"
      />

      {/* PANEL */}

      <aside className="absolute bottom-3 right-3 top-3 z-10 flex w-[calc(100%-24px)] max-w-[400px] flex-col overflow-hidden rounded-[28px] bg-[#FFF7EB] shadow-2xl">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="flex shrink-0 items-center justify-between border-b border-[#403A35]/10 px-5 py-4">

          <div>

            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
              Cohiva Classroom
            </p>

            <h2 className="mt-1 text-xl font-black text-[#3D3732]">
              Class Chat
            </h2>

            <p className="mt-1 text-xs font-semibold text-[#756E64]">
              Chat with everyone in this meeting
            </p>

          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#403A35]/10 text-xl font-black text-[#403A35] transition hover:bg-[#CC3A63] hover:text-white"
          >
            ×
          </button>

        </div>

        {/* =================================================
            MESSAGES

            ONLY THIS SECTION SCROLLS
        ================================================= */}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">

          {/* LOADING */}

          {loading && (
            <div className="flex h-full items-center justify-center">

              <div className="text-center">

                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

                <p className="mt-3 text-xs font-bold text-[#756E64]">
                  Loading messages...
                </p>

              </div>

            </div>
          )}

          {/* EMPTY */}

          {!loading &&
            messages.length ===
              0 && (
              <div className="flex h-full items-center justify-center text-center">

                <div>

                  <div className="text-4xl">
                    💬
                  </div>

                  <p className="mt-3 font-black text-[#3D3732]">
                    Start the conversation
                  </p>

                  <p className="mt-1 max-w-[230px] text-xs leading-5 text-[#756E64]">
                    Messages from this class will appear here.
                  </p>

                </div>

              </div>
            )}

          {/* MESSAGE LIST */}

          {!loading && (
            <div className="space-y-3">

              {messages.map(
                (
                  message
                ) => {
                  const mine =
                    message.senderId ===
                    currentUserId;

                  return (
                    <div
                      key={
                        message.id
                      }
                      className={`flex ${
                        mine
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >

                      <div
                        className={`max-w-[85%] rounded-[18px] px-4 py-3 ${
                          mine
                            ? "rounded-br-md bg-[#CC3A63] text-white"
                            : "rounded-bl-md border border-[#403A35]/5 bg-white text-[#3D3732] shadow-sm"
                        }`}
                      >

                        {/* SENDER */}

                        {!mine && (
                          <p className="mb-1 text-[10px] font-black text-[#737C4C]">
                            {message.senderName}
                          </p>
                        )}

                        {/* MESSAGE */}

                        <p className="whitespace-pre-wrap break-words text-sm leading-5">
                          {message.text}
                        </p>

                        {/* TIME */}

                        <p
                          className={`mt-1.5 text-[9px] ${
                            mine
                              ? "text-white/60"
                              : "text-[#756E64]"
                          }`}
                        >
                          {new Date(
                            message.sentAt
                          ).toLocaleTimeString(
                            [],
                            {
                              hour:
                                "2-digit",

                              minute:
                                "2-digit",
                            }
                          )}
                        </p>

                      </div>

                    </div>
                  );
                }
              )}

              <div
                ref={
                  bottomRef
                }
              />

            </div>
          )}

        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="mx-4 mb-2 shrink-0 rounded-xl bg-[#CC3A63]/10 px-3 py-2 text-xs font-bold text-[#CC3A63]">
            {error}
          </div>
        )}

        {/* =================================================
            COMPOSER
        ================================================= */}

        <form
          onSubmit={
            sendMessage
          }
          className="flex shrink-0 gap-2 border-t border-[#403A35]/10 bg-[#F9F0E0] p-3"
        >

          <input
            value={
              text
            }
            onChange={(
              event
            ) =>
              setText(
                event.target.value
              )
            }
            maxLength={
              1500
            }
            placeholder="Message the class..."
            className="min-w-0 flex-1 rounded-2xl border border-[#403A35]/10 bg-white px-4 py-3 text-sm text-[#3D3732] outline-none transition placeholder:text-[#756E64]/50 focus:border-[#A2AB73]"
          />

          <button
            type="submit"
            disabled={
              sending ||
              !text.trim()
            }
            className="rounded-2xl bg-[#CC3A63] px-4 py-3 text-sm font-black text-white transition hover:bg-[#B83057] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending
              ? "..."
              : "Send"}
          </button>

        </form>

      </aside>

    </div>
  );
};

export default MeetingChatPanel;