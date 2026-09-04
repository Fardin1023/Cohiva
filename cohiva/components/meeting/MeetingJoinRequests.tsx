"use client";

import {
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/* =========================================================
   TYPES
========================================================= */

type MeetingJoinRequestsProps = {
  callId: string;
};

type JoinRequest = {
  userId: string;

  name: string;

  image: string;

  requestedAt: string;
};

type MeetingAccessMode =
  | "open"
  | "approval"
  | "locked";

/* =========================================================
   HELPERS
========================================================= */

const normalizeAccessMode =
  (
    value:
      unknown
  ): MeetingAccessMode => {
    if (
      value ===
        "open" ||
      value ===
        "approval" ||
      value ===
        "locked"
    ) {
      return value;
    }

    return "approval";
  };

/* =========================================================
   COMPONENT
========================================================= */

const MeetingJoinRequests = ({
  callId,
}: MeetingJoinRequestsProps) => {
  const call =
    useCall();

  const {
    useCallCustomData,
  } =
    useCallStateHooks();

  const custom =
    useCallCustomData();

  const teacher =
    Boolean(
      call?.isCreatedByMe
    );

  const accessMode =
    normalizeAccessMode(
      custom?.cohiva_access_mode
    );

  /* =====================================================
     STATE
  ===================================================== */

  const [
    requests,
    setRequests,
  ] =
    useState<
      JoinRequest[]
    >([]);

  const [
    busyUserId,
    setBusyUserId,
  ] =
    useState<string | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const previousIdsRef =
    useRef<
      Set<string>
    >(
      new Set()
    );

  /* =====================================================
     LOAD PENDING REQUESTS
  ===================================================== */

  const loadRequests =
    useCallback(
      async () => {
        if (
          !teacher ||
          accessMode !==
            "approval"
        ) {
          setRequests(
            []
          );

          return;
        }

        try {
          const response =
            await fetch(
              `/api/meetings/join-request?callId=${encodeURIComponent(
                callId
              )}&scope=pending`,
              {
                method:
                  "GET",

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
                "Unable to load waiting room."
            );
          }

          const nextRequests:
            JoinRequest[] =
            Array.isArray(
              result.requests
            )
              ? result.requests
              : [];

          /* =============================================
             DETECT NEW REQUEST

             Used for screen-reader announcement
             and optional browser notification.
          ============================================= */

          const previousIds =
            previousIdsRef.current;

          const newRequest =
            nextRequests.find(
              (
                request
              ) =>
                !previousIds.has(
                  request.userId
                )
            );

          previousIdsRef.current =
            new Set(
              nextRequests.map(
                (
                  request
                ) =>
                  request.userId
              )
            );

          /*
           * Browser notification is optional.
           * It only appears if permission was
           * already granted previously.
           */
          if (
            newRequest &&
            typeof window !==
              "undefined" &&
            "Notification" in
              window &&
            Notification.permission ===
              "granted"
          ) {
            new Notification(
              "Cohiva waiting room",
              {
                body:
                  `${newRequest.name} wants to join your class.`,
              }
            );
          }

          setRequests(
            nextRequests
          );

          setError(
            ""
          );
        } catch (
          loadError
        ) {
          console.error(
            "Waiting room load error:",
            loadError
          );

          /*
           * Don't constantly flash an error
           * during a temporary polling failure.
           * Existing request stays visible.
           */
        }
      },
      [
        accessMode,
        callId,
        teacher,
      ]
    );

  /* =====================================================
     POLLING

     1.5 seconds is responsive without
     hammering your API every few hundred ms.
  ===================================================== */

  useEffect(() => {
    if (
      !teacher ||
      accessMode !==
        "approval"
    ) {
      setRequests(
        []
      );

      return;
    }

    void loadRequests();

    const timer =
      window.setInterval(
        () => {
          void loadRequests();
        },
        1500
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    teacher,
    accessMode,
    loadRequests,
  ]);

  /* =====================================================
     APPROVE / DENY
  ===================================================== */

  const decide =
    async (
      targetUserId:
        string,

      action:
        "approve"
        | "deny"
    ) => {
      if (
        busyUserId
      ) {
        return;
      }

      try {
        setBusyUserId(
          targetUserId
        );

        setError(
          ""
        );

        const response =
          await fetch(
            "/api/meetings/join-request",
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

                  action,

                  targetUserId,
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
              "Unable to process request."
          );
        }

        /*
         * Remove immediately instead of
         * waiting for the next poll.
         */
        setRequests(
          (
            current
          ) =>
            current.filter(
              (
                request
              ) =>
                request.userId !==
                targetUserId
            )
        );

        previousIdsRef.current.delete(
          targetUserId
        );
      } catch (
        decisionError
      ) {
        console.error(
          "Waiting room decision error:",
          decisionError
        );

        setError(
          decisionError instanceof
            Error
            ? decisionError.message
            : "Could not process this request."
        );
      } finally {
        setBusyUserId(
          null
        );
      }
    };

  /* =====================================================
     HIDDEN
  ===================================================== */

  if (
    !teacher ||
    accessMode !==
      "approval" ||
    requests.length ===
      0
  ) {
    return null;
  }

  const currentRequest =
    requests[0];

  const busy =
    busyUserId ===
    currentRequest.userId;

  /* =====================================================
     UI
  ===================================================== */

  return (
    <section
      role="alertdialog"
      aria-live="assertive"
      aria-label={`${currentRequest.name} wants to join the meeting`}
      className="fixed right-4 top-[76px] z-[280] w-[360px] max-w-[calc(100vw-32px)] rounded-[24px] border border-[#403A35]/10 bg-[#FFF7EB] p-4 text-[#3D3732] shadow-[0_25px_70px_rgba(0,0,0,0.35)]"
    >

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="flex items-start justify-between gap-3">

        <div>

          <div className="flex items-center gap-2">

            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#CC3A63]/10 text-sm">
              🚪
            </span>

            <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#CC3A63]">
              Waiting Room
            </p>

          </div>

          <h3 className="mt-2 text-base font-black">
            Someone wants to join
          </h3>

        </div>

        {requests.length >
          1 && (
          <span className="rounded-full bg-[#A2AB73]/15 px-2.5 py-1 text-[10px] font-black text-[#737C4C]">
            {requests.length} waiting
          </span>
        )}

      </div>

      {/* =================================================
          PARTICIPANT
      ================================================= */}

      <div className="mt-4 flex items-center gap-3 rounded-[18px] border border-[#403A35]/5 bg-white p-3">

        {/* AVATAR */}

        {currentRequest.image ? (
          <img
            src={
              currentRequest.image
            }
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#403A35] text-base font-black text-white">
            {currentRequest.name
              .charAt(
                0
              )
              .toUpperCase()}
          </div>
        )}

        {/* INFORMATION */}

        <div className="min-w-0 flex-1">

          <p className="truncate font-black text-[#3D3732]">
            {currentRequest.name}
          </p>

          <p className="mt-0.5 text-xs text-[#756E64]">
            wants to join your classroom.
          </p>

          {currentRequest.requestedAt && (
            <p className="mt-1 text-[9px] font-semibold text-[#756E64]/65">
              Requested{" "}
              {new Date(
                currentRequest.requestedAt
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
          )}

        </div>

      </div>

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="mt-3 rounded-xl bg-[#CC3A63]/10 px-3 py-2.5">

          <p className="text-xs font-bold text-[#CC3A63]">
            {error}
          </p>

        </div>
      )}

      {/* =================================================
          BUTTONS
      ================================================= */}

      <div className="mt-4 grid grid-cols-2 gap-2">

        <button
          type="button"
          disabled={
            busy
          }
          onClick={() =>
            void decide(
              currentRequest.userId,
              "deny"
            )
          }
          className="rounded-xl bg-[#CC3A63]/10 px-4 py-2.5 text-xs font-black text-[#CC3A63] transition hover:bg-[#CC3A63] hover:text-white disabled:cursor-wait disabled:opacity-50"
        >
          Deny
        </button>

        <button
          type="button"
          disabled={
            busy
          }
          onClick={() =>
            void decide(
              currentRequest.userId,
              "approve"
            )
          }
          className="rounded-xl bg-[#A2AB73] px-4 py-2.5 text-xs font-black text-white transition hover:brightness-95 disabled:cursor-wait disabled:opacity-50"
        >
          {busy
            ? "Allowing..."
            : "Allow"}
        </button>

      </div>

      {/* =================================================
          MORE WAITING
      ================================================= */}

      {requests.length >
        1 && (
        <p className="mt-3 text-center text-[10px] font-semibold text-[#756E64]">
          {requests.length -
            1}
          {" "}
          more{" "}
          {requests.length -
            1 ===
          1
            ? "person is"
            : "people are"}
          {" "}
          waiting.
        </p>
      )}

    </section>
  );
};

export default MeetingJoinRequests;