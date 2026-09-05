"use client";

import {
  useCall,
  type CustomVideoEvent,
  type StreamVideoEvent,
} from "@stream-io/video-react-sdk";

import {
  useUser,
} from "@clerk/nextjs";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSmartPolling } from "@/lib/useSmartPolling";

/* =========================================================
   TYPES
========================================================= */

type MeetingChatPanelProps = {
  open: boolean;

  onClose: () => void;

  callId: string;
};

type ChatMessage = {
  messageId: string;

  senderId: string;

  senderName: string;

  senderImage: string;

  text: string;

  createdAt: string;

  optimistic?: boolean;
};

/* =========================================================
   CONFIG
========================================================= */

const CHAT_EVENT =
  "cohiva-chat";

const MAX_MESSAGE_LENGTH =
  1000;

/* =========================================================
   HELPERS
========================================================= */

const normalizeMessage = (
  value: any
): ChatMessage | null => {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  if (
    typeof value.messageId !==
      "string" ||
    typeof value.senderId !==
      "string" ||
    typeof value.text !==
      "string"
  ) {
    return null;
  }

  return {
    messageId:
      value.messageId,

    senderId:
      value.senderId,

    senderName:
      typeof value.senderName ===
      "string"
        ? value.senderName
        : "Participant",

    senderImage:
      typeof value.senderImage ===
      "string"
        ? value.senderImage
        : "",

    text:
      value.text,

    createdAt:
      typeof value.createdAt ===
      "string"
        ? value.createdAt
        : new Date()
            .toISOString(),

    optimistic:
      Boolean(
        value.optimistic
      ),
  };
};

/* =========================================================
   MERGE WITHOUT DUPLICATES
========================================================= */

const mergeMessages = (
  current:
    ChatMessage[],

  incoming:
    ChatMessage[]
) => {
  const map =
    new Map<
      string,
      ChatMessage
    >();

  current.forEach(
    (
      message
    ) => {
      map.set(
        message.messageId,
        message
      );
    }
  );

  incoming.forEach(
    (
      message
    ) => {
      const existing =
        map.get(
          message.messageId
        );

      /*
       * Server version replaces
       * optimistic version.
       */
      if (
        !existing ||
        (
          existing.optimistic &&
          !message.optimistic
        )
      ) {
        map.set(
          message.messageId,
          message
        );
      }
    }
  );

  return Array.from(
    map.values()
  ).sort(
    (
      a,
      b
    ) =>
      new Date(
        a.createdAt
      ).getTime() -
      new Date(
        b.createdAt
      ).getTime()
  );
};

/* =========================================================
   COMPONENT
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
    user?.id ||
    "";

  const currentName =
    user?.fullName ||
    user?.username ||
    user?.firstName ||
    "Participant";

  const currentImage =
    user?.imageUrl ||
    "";

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
    draft,
    setDraft,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    sending,
    setSending,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    loadedOnce,
    setLoadedOnce,
  ] =
    useState(false);

  /* =====================================================
     REFS
  ===================================================== */

  const messageAreaRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const inputRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );

  /* =====================================================
     RESET IF MEETING CHANGES
  ===================================================== */

  useEffect(() => {
    setMessages(
      []
    );

    setDraft(
      ""
    );

    setError(
      ""
    );

    setLoadedOnce(
      false
    );
  }, [
    callId,
  ]);

  /* =====================================================
     LOAD HISTORY
  ===================================================== */

  const loadHistory =
    useCallback(
      async (
        silent =
          false
      ) => {
        try {
          if (
            !silent
          ) {
            setLoading(
              true
            );
          }

          const response =
            await fetch(
              `/api/meetings/chat?callId=${encodeURIComponent(
                callId
              )}`,
              {
                method:
                  "GET",

                cache:
                  "no-store",
              }
            );

          const result =
            (await response.json()) as {
              error?: string;
              messages?: unknown[];
            };

          if (
            !response.ok
          ) {
            throw new Error(
              result.error ||
                "Unable to load chat."
            );
          }

          const incoming =
            Array.isArray(
              result.messages
            )
              ? result.messages
                  .map(
                    (message: unknown) =>
                      normalizeMessage(
                        message
                      )
                  )
                  .filter(
                    (
                      message
                    ):
                      message is ChatMessage =>
                        Boolean(
                          message
                        )
                  )
              : [];

          /*
           * Merge instead of replacing.
           *
           * This prevents a message received
           * through realtime during the GET
           * request from disappearing.
           */
          setMessages(
            (
              current
            ) =>
              mergeMessages(
                current,
                incoming
              )
          );

          setLoadedOnce(
            true
          );

          setError(
            ""
          );
        } catch (
          historyError
        ) {
          console.error(
            "Chat history error:",
            historyError
          );

          if (
            !silent
          ) {
            setError(
              historyError instanceof
                Error
                ? historyError.message
                : "Unable to load class chat."
            );
          }
        } finally {
          if (
            !silent
          ) {
            setLoading(
              false
            );
          }
        }
      },
      [
        callId,
      ]
    );

  /* =====================================================
     FALLBACK HISTORY SYNC

     Stream custom events are the primary realtime path.
     This visibility-aware fallback is intentionally slower
     so an open chat panel does not hit MongoDB every 5s.
  ===================================================== */

  useSmartPolling(
    () =>
      loadHistory(
        loadedOnce
      ),
    {
      enabled: open,
      intervalMs:
        30_000,
    }
  );

  /* =====================================================
     REALTIME EVENTS

     Listener stays mounted even when
     the chat panel is closed.

     So messages are not missed while
     the user is watching the meeting.
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
          const payload =
            (
              event as
                CustomVideoEvent
            ).custom as
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

          const message =
            normalizeMessage(
              payload
            );

          if (!message) {
            return;
          }

          setMessages(
            (
              current
            ) =>
              mergeMessages(
                current,
                [
                  message,
                ]
              )
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
  ]);

  /* =====================================================
     AUTO SCROLL
  ===================================================== */

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    const area =
      messageAreaRef.current;

    if (!area) {
      return;
    }

    requestAnimationFrame(
      () => {
        area.scrollTo({
          top:
            area.scrollHeight,

          behavior:
            "smooth",
        });
      }
    );
  }, [
    messages.length,
    open,
  ]);

  /* =====================================================
     FOCUS INPUT
  ===================================================== */

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          inputRef.current?.focus();
        },
        150
      );

    return () => {
      clearTimeout(
        timer
      );
    };
  }, [
    open,
  ]);

  /* =====================================================
     SEND MESSAGE
  ===================================================== */

  const sendMessage =
    async () => {
      if (
        !currentUserId ||
        sending
      ) {
        return;
      }

      const text =
        draft
          .trim()
          .slice(
            0,
            MAX_MESSAGE_LENGTH
          );

      if (!text) {
        return;
      }

      const messageId =
        crypto.randomUUID();

      const optimisticMessage:
        ChatMessage = {
        messageId,

        senderId:
          currentUserId,

        senderName:
          currentName,

        senderImage:
          currentImage,

        text,

        createdAt:
          new Date()
            .toISOString(),

        optimistic:
          true,
      };

      /* ===============================================
         SHOW IMMEDIATELY
      =============================================== */

      setMessages(
        (
          current
        ) =>
          mergeMessages(
            current,
            [
              optimisticMessage,
            ]
          )
      );

      setDraft(
        ""
      );

      setError(
        ""
      );

      try {
        setSending(
          true
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

                  messageId,

                  text,

                  senderName:
                    currentName,

                  senderImage:
                    currentImage,
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

        const confirmed =
          normalizeMessage(
            result.message
          );

        if (
          confirmed
        ) {
          setMessages(
            (
              current
            ) =>
              mergeMessages(
                current.filter(
                  (
                    message
                  ) =>
                    message.messageId !==
                    messageId
                ),

                [
                  confirmed,
                ]
              )
          );
        }
      } catch (
        sendError
      ) {
        console.error(
          "Send chat message error:",
          sendError
        );

        /*
         * Remove the failed optimistic
         * message.
         */
        setMessages(
          (
            current
          ) =>
            current.filter(
              (
                message
              ) =>
                message.messageId !==
                messageId
            )
        );

        /*
         * Put text back so the user
         * doesn't lose what they typed.
         */
        setDraft(
          text
        );

        setError(
          sendError instanceof
            Error
            ? sendError.message
            : "Unable to send message."
        );
      } finally {
        setSending(
          false
        );
      }
    };

  /* =====================================================
     ENTER TO SEND

     Shift + Enter creates a new line.
  ===================================================== */

  const handleKeyDown =
    (
      event:
        React.KeyboardEvent<HTMLTextAreaElement>
    ) => {
      if (
        event.key ===
          "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();

        void sendMessage();
      }
    };

  /* =====================================================
     DATE / TIME
  ===================================================== */

  const formatter =
    useMemo(
      () =>
        new Intl.DateTimeFormat(
          undefined,
          {
            hour:
              "2-digit",

            minute:
              "2-digit",
          }
        ),
      []
    );

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
    <aside
      aria-label="Class chat"
      className="fixed bottom-[76px] right-0 top-[64px] z-[240] flex w-full flex-col overflow-hidden border-l border-[#403A35]/10 bg-[#FFF7EB] text-[#3D3732] shadow-[-18px_0_55px_rgba(0,0,0,0.18)] sm:w-[390px]"
    >

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="flex shrink-0 items-center justify-between border-b border-[#403A35]/10 bg-white px-4 py-4">

        <div>

          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#CC3A63]">
            Cohiva Classroom
          </p>

          <div className="mt-1 flex items-center gap-2">

            <h2 className="text-lg font-black text-[#3D3732]">
              Class Chat
            </h2>

            <span className="rounded-full bg-[#A2AB73]/15 px-2 py-0.5 text-[9px] font-black text-[#737C4C]">
              Live
            </span>

          </div>

        </div>

        <button
          type="button"
          aria-label="Close chat"
          onClick={
            onClose
          }
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black text-[#3D3732] transition hover:bg-[#CC3A63]/10 hover:text-[#CC3A63]"
        >
          ×
        </button>

      </header>

      {/* =================================================
          MESSAGES

          ONLY THIS SECTION SCROLLS.
      ================================================= */}

      <div
        ref={
          messageAreaRef
        }
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >

        {/* LOADING */}

        {loading &&
          messages.length ===
            0 && (
            <div className="flex h-full items-center justify-center">

              <div className="text-center">

                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#A2AB73]/20 border-t-[#A2AB73]" />

                <p className="mt-3 text-xs font-bold text-[#756E64]">
                  Loading class chat...
                </p>

              </div>

            </div>
          )}

        {/* EMPTY */}

        {!loading &&
          messages.length ===
            0 && (
            <div className="flex h-full items-center justify-center">

              <div className="max-w-[240px] text-center">

                <div className="text-4xl">
                  💬
                </div>

                <h3 className="mt-3 font-black text-[#3D3732]">
                  Start the conversation
                </h3>

                <p className="mt-2 text-xs leading-5 text-[#756E64]">
                  Messages sent here are saved with this meeting and available when participants rejoin.
                </p>

              </div>

            </div>
          )}

        {/* MESSAGES */}

        <div
          aria-live="polite"
          className="space-y-4"
        >

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
                    message.messageId
                  }
                  className={`flex gap-2.5 ${
                    mine
                      ? "flex-row-reverse"
                      : ""
                  }`}
                >

                  {/* AVATAR */}

                  {message.senderImage ? (
                    <img
                      src={
                        message.senderImage
                      }
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#403A35] text-[10px] font-black text-white">
                      {message.senderName
                        .charAt(
                          0
                        )
                        .toUpperCase()}
                    </div>
                  )}

                  {/* MESSAGE */}

                  <div
                    className={`min-w-0 max-w-[78%] ${
                      mine
                        ? "items-end"
                        : "items-start"
                    }`}
                  >

                    <div
                      className={`mb-1 flex items-center gap-2 ${
                        mine
                          ? "justify-end"
                          : ""
                      }`}
                    >

                      <span className="max-w-[150px] truncate text-[9px] font-black text-[#756E64]">
                        {mine
                          ? "You"
                          : message.senderName}
                      </span>

                      <span className="text-[8px] font-semibold text-[#756E64]/60">
                        {formatter.format(
                          new Date(
                            message.createdAt
                          )
                        )}
                      </span>

                    </div>

                    <div
                      className={`whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2.5 text-sm leading-5 ${
                        mine
                          ? "rounded-tr-md bg-[#CC3A63] text-white"
                          : "rounded-tl-md border border-[#403A35]/5 bg-white text-[#3D3732]"
                      } ${
                        message.optimistic
                          ? "opacity-65"
                          : ""
                      }`}
                    >
                      {message.text}
                    </div>

                    {message.optimistic && (
                      <p className="mt-1 text-right text-[8px] font-bold text-[#756E64]/60">
                        Sending...
                      </p>
                    )}

                  </div>

                </div>
              );
            }
          )}

        </div>

      </div>

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="shrink-0 border-t border-[#CC3A63]/10 bg-[#CC3A63]/10 px-4 py-2">

          <p className="text-xs font-bold text-[#CC3A63]">
            {error}
          </p>

        </div>
      )}

      {/* =================================================
          INPUT
      ================================================= */}

      <footer className="shrink-0 border-t border-[#403A35]/10 bg-white p-3">

        <div className="flex items-end gap-2 rounded-[18px] border border-[#403A35]/10 bg-[#FFF7EB] p-2">

          <textarea
            ref={
              inputRef
            }
            value={
              draft
            }
            maxLength={
              MAX_MESSAGE_LENGTH
            }
            rows={
              2
            }
            placeholder="Message the class..."
            onChange={(
              event
            ) =>
              setDraft(
                event.target.value
              )
            }
            onKeyDown={
              handleKeyDown
            }
            className="max-h-[110px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#3D3732] outline-none placeholder:text-[#756E64]/55"
          />

          <button
            type="button"
            aria-label="Send message"
            disabled={
              sending ||
              !draft.trim()
            }
            onClick={() =>
              void sendMessage()
            }
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#CC3A63] text-lg font-black text-white transition hover:bg-[#B83259] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ➤
          </button>

        </div>

        <div className="mt-2 flex items-center justify-between px-1">

          <p className="text-[8px] font-semibold text-[#756E64]/65">
            Enter to send · Shift + Enter for new line
          </p>

          <p
            className={`text-[8px] font-bold ${
              draft.length >
              900
                ? "text-[#CC3A63]"
                : "text-[#756E64]/55"
            }`}
          >
            {draft.length}/
            {MAX_MESSAGE_LENGTH}
          </p>

        </div>

      </footer>

    </aside>
  );
};

export default MeetingChatPanel;