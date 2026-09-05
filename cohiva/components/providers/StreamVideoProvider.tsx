"use client";

import { useUser } from "@clerk/nextjs";

import {
  StreamVideo,
  StreamVideoClient,
  type User,
} from "@stream-io/video-react-sdk";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

/* =========================================================
   TYPES
========================================================= */

type StreamVideoProviderProps = {
  children: ReactNode;
};

type ConnectedStreamProviderProps = {
  children: ReactNode;
  apiKey: string;
  userId: string;
};

/* =========================================================
   TOKEN PROVIDER
========================================================= */

type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

const tokenCache =
  new Map<
    string,
    TokenCacheEntry
  >();

const TOKEN_CACHE_MS =
  50 * 60 * 1000;

const getStreamToken =
  async (
    userId: string
  ): Promise<string> => {
    const cached =
      tokenCache.get(
        userId
      );

    if (
      cached &&
      cached.expiresAt >
        Date.now()
    ) {
      return cached.token;
    }

    const response =
      await fetch(
        "/api/stream-token",
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      throw new Error(
        `Unable to get Stream token: ${response.status}`
      );
    }

    const data =
      await response.json();

    if (!data.token) {
      throw new Error(
        "Stream token was not returned."
      );
    }

    tokenCache.set(
      userId,
      {
        token: data.token,
        expiresAt:
          Date.now() +
          TOKEN_CACHE_MS,
      }
    );

    return data.token;
  };

/* =========================================================
   CONNECTED STREAM PROVIDER
========================================================= */

const ConnectedStreamProvider = ({
  children,
  apiKey,
  userId,
}: ConnectedStreamProviderProps) => {
  const [
    client,
    setClient,
  ] =
    useState<StreamVideoClient>();

  /*
   * Keep the SAME Stream client
   * instead of recreating it on
   * ordinary React renders.
   */
  const clientRef =
    useRef<StreamVideoClient | null>(
      null
    );

  const clientUserIdRef =
    useRef<string | null>(
      null
    );

  const clientApiKeyRef =
    useRef<string | null>(
      null
    );

  /*
   * Important:
   *
   * Development mode can temporarily
   * run effect cleanup and then mount
   * the effect again.
   *
   * Instead of instantly disconnecting,
   * we wait briefly. If the component
   * comes straight back, that cleanup
   * gets cancelled.
   */
  const disconnectTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  useEffect(() => {
    /* =====================================================
       CANCEL TEMPORARY DISCONNECT
    ===================================================== */

    if (
      disconnectTimerRef.current
    ) {
      clearTimeout(
        disconnectTimerRef.current
      );

      disconnectTimerRef.current =
        null;
    }

    /* =====================================================
       CHECK WHETHER EXISTING CLIENT CAN BE REUSED
    ===================================================== */

    const existingClient =
      clientRef.current;

    const userChanged =
      clientUserIdRef.current !==
      null &&
      clientUserIdRef.current !==
        userId;

    const apiKeyChanged =
      clientApiKeyRef.current !==
      null &&
      clientApiKeyRef.current !==
        apiKey;

    /*
     * If the actual authenticated
     * Stream user changes, dispose
     * the old client.
     */
    if (
      existingClient &&
      (
        userChanged ||
        apiKeyChanged
      )
    ) {
      void existingClient
        .disconnectUser()
        .catch(
          (
            error
          ) => {
            console.error(
              "Stream old client disconnect error:",
              error
            );
          }
        );

      clientRef.current =
        null;
    }

    /* =====================================================
       CREATE CLIENT ONCE
    ===================================================== */

    if (
      !clientRef.current
    ) {
      const streamUser: User =
        {
          id: userId,
        };

      const streamClient =
        new StreamVideoClient({
          apiKey,

          user:
            streamUser,

          tokenProvider:
            () =>
              getStreamToken(
                userId
              ),

          options: {
            maxConnectUserRetries:
              5,

            onConnectUserError: (
              error,
              allErrors
            ) => {
              console.error(
                "Stream connection error:",
                error,
                allErrors
              );
            },
          },
        });

      clientRef.current =
        streamClient;

      clientUserIdRef.current =
        userId;

      clientApiKeyRef.current =
        apiKey;
    }

    const activeClient =
      clientRef.current;

    setClient(
      activeClient
    );

    /* =====================================================
       CLEANUP
    ===================================================== */

    return () => {
      /*
       * Don't immediately disconnect.
       *
       * This protects us from temporary
       * React development cleanup.
       */
      disconnectTimerRef.current =
        setTimeout(
          () => {
            /*
             * Only disconnect if this
             * is STILL the currently
             * stored Stream client.
             */
            if (
              clientRef.current ===
              activeClient
            ) {
              void activeClient
                .disconnectUser()
                .catch(
                  (
                    error
                  ) => {
                    console.error(
                      "Stream disconnect error:",
                      error
                    );
                  }
                );

              clientRef.current =
                null;

              clientUserIdRef.current =
                null;

              clientApiKeyRef.current =
                null;
            }
          },
          750
        );
    };
  }, [
    apiKey,
    userId,
  ]);

  /* =====================================================
     CONNECTING
  ===================================================== */

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F0E0]">

        <div className="text-center">

          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

          <p className="mt-4 text-sm font-semibold text-[#756E64]">
            Connecting Cohiva...
          </p>

        </div>

      </div>
    );
  }

  return (
    <StreamVideo
      client={
        client
      }
    >
      {children}
    </StreamVideo>
  );
};

/* =========================================================
   MAIN PROVIDER
========================================================= */

const StreamVideoProvider = ({
  children,
}: StreamVideoProviderProps) => {
  const {
    user,
    isLoaded,
    isSignedIn,
  } =
    useUser();

  const apiKey =
    process.env
      .NEXT_PUBLIC_STREAM_API_KEY;

  /* =====================================================
     CLERK LOADING
  ===================================================== */

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F0E0]">

        <div className="text-center">

          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

          <p className="mt-4 text-sm font-semibold text-[#756E64]">
            Loading Cohiva...
          </p>

        </div>

      </div>
    );
  }

  /* =====================================================
     SIGNED OUT
  ===================================================== */

  if (
    !isSignedIn ||
    !user
  ) {
    return (
      <>
        {children}
      </>
    );
  }

  /* =====================================================
     STREAM CONFIG ERROR
  ===================================================== */

  if (!apiKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F0E0] p-6">

        <div className="max-w-md rounded-[28px] bg-[#FFF7EB] p-8 text-center shadow-lg">

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#CC3A63]/10 text-2xl font-black text-[#CC3A63]">
            !
          </div>

          <h2 className="mt-5 text-2xl font-black text-[#3D3732]">
            Stream configuration missing
          </h2>

          <p className="mt-3 text-sm leading-6 text-[#756E64]">
            NEXT_PUBLIC_STREAM_API_KEY
            could not be found.
          </p>

        </div>

      </div>
    );
  }

  /*
   * IMPORTANT:
   *
   * Only user.id controls Stream
   * client creation now.
   *
   * Changes to Clerk avatar/name
   * will NOT recreate the Stream
   * connection and kick the user
   * out of a meeting.
   */
  return (
    <ConnectedStreamProvider
      apiKey={
        apiKey
      }
      userId={
        user.id
      }
    >
      {children}
    </ConnectedStreamProvider>
  );
};

export default StreamVideoProvider;