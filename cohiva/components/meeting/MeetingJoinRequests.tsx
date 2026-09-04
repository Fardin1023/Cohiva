"use client";

import {
  useCall,
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

/* =========================================================
   COMPONENT
========================================================= */

const MeetingJoinRequests = ({
  callId,
}: MeetingJoinRequestsProps) => {
  const call =
    useCall();

  const teacher =
    Boolean(
      call?.isCreatedByMe
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

  const previousCountRef =
    useRef(0);

  /* =====================================================
     LOAD PENDING REQUESTS
  ===================================================== */

  const loadRequests =
    useCallback(
      async () => {
        if (
          !teacher
        ) {
          return;
        }

        try {
          const response =
            await fetch(
              `/api/meetings/join-request?callId=${encodeURIComponent(
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
             OPTIONAL BROWSER NOTIFICATION

             Only fires if notification permission
             was previously granted.
          ============================================= */

          if (
            typeof window !==
              "undefined" &&
            nextRequests.length >
              previousCountRef.current &&
            "Notification" in
              window &&
            Notification.permission ===
              "granted"
          ) {
            const newest =
              nextRequests[
                nextRequests.length -
                  1
              ];

            new Notification(
              "Cohiva waiting room",
              {
                body:
                  `${newest?.name ?? "Someone"} wants to join your meeting.`,
              }
            );
          }

          previousCountRef.current =
            nextRequests.length;

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
        }
      },
      [
        callId,
        teacher,
      ]
    );

  /* =====================================================
     POLL WAITING ROOM

     Checks every second.
  ===================================================== */

  useEffect(() => {
    if (
      !teacher
    ) {
      return;
    }

    void loadRequests();

    const timer =
      window.setInterval(
        () => {
          void loadRequests();
        },
        1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    teacher,
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
              "Unable to process join request."
          );
        }

        /* =============================================
           REMOVE REQUEST IMMEDIATELY
        ============================================= */

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
            : "Could not process join request."
        );
      } finally {
        setBusyUserId(
          null
        );
      }
    };

  /* =====================================================
     DO NOT RENDER FOR STUDENT
  ===================================================== */

  if (
    !teacher ||
    requests.length ===
      0
  ) {
    return null;
  }

  /* =====================================================
     FIRST REQUEST
  ===================================================== */

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
      aria-label="Participant waiting for approval"
      className="fixed right-4 top-[78px] z-[260] w-[355px] max-w-[calc(100vw-32px)] rounded-[24px] border border-[#403A35]/10 bg-[#FFF7EB] p-4 text-[#3D3732] shadow-2xl"
    >

      {/* HEADER */}

      <div className="flex items-start justify-between gap-3">

        <div>

          <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#CC3A63]">
            Waiting Room
          </p>

          <h3 className="mt-1 text-base font-black">
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

      {/* PARTICIPANT */}

      <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-white p-3">

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

        {/* NAME */}

        <div className="min-w-0 flex-1">

          <p className="truncate font-black text-[#3D3732]">
            {currentRequest.name}
          </p>

          <p className="mt-0.5 text-xs text-[#756E64]">
            wants to join your classroom.
          </p>

          {currentRequest.requestedAt && (
            <p className="mt-1 text-[9px] font-semibold text-[#756E64]/70">
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

      {/* ERROR */}

      {error && (
        <div className="mt-3 rounded-xl bg-[#CC3A63]/10 p-2.5">

          <p className="text-xs font-bold text-[#CC3A63]">
            {error}
          </p>

        </div>
      )}

      {/* ACTIONS */}

      <div className="mt-4 grid grid-cols-2 gap-2">

        {/* DENY */}

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
          className="rounded-xl bg-[#CC3A63]/10 px-4 py-2.5 text-xs font-black text-[#CC3A63] transition hover:bg-[#CC3A63] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Deny
        </button>

        {/* ALLOW */}

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
          className="rounded-xl bg-[#A2AB73] px-4 py-2.5 text-xs font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Please wait..."
            : "Allow"}
        </button>

      </div>

      {/* MULTIPLE WAITING */}

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