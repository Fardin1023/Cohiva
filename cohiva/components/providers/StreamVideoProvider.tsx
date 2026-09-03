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
  useState,
} from "react";

type StreamVideoProviderProps = {
  children: ReactNode;
};

type ConnectedStreamProviderProps = {
  children: ReactNode;
  apiKey: string;
  userId: string;
  userName: string;
  userImage?: string;
};

/* =========================================================
   TOKEN PROVIDER
========================================================= */

const getStreamToken = async (): Promise<string> => {
  const response = await fetch(
    "/api/stream-token"
  );

  if (!response.ok) {
    throw new Error(
      `Unable to get Stream token: ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error(
      "Stream token was not returned."
    );
  }

  return data.token;
};

/* =========================================================
   CONNECTED STREAM PROVIDER
========================================================= */

const ConnectedStreamProvider = ({
  children,
  apiKey,
  userId,
  userName,
  userImage,
}: ConnectedStreamProviderProps) => {
  const [client, setClient] =
    useState<StreamVideoClient>();

  useEffect(() => {
    const streamUser: User = {
      id: userId,
      name: userName,
      image: userImage,
    };

    /*
     * Create the Stream client.
     *
     * This follows Stream's current
     * recommended React pattern.
     */
    const streamClient =
      new StreamVideoClient({
        apiKey,
        user: streamUser,
        tokenProvider: getStreamToken,
      });

    setClient(streamClient);

    return () => {
      setClient(undefined);

      void streamClient
        .disconnectUser()
        .catch((error) => {
          console.error(
            "Stream disconnect error:",
            error
          );
        });
    };
  }, [
    apiKey,
    userId,
    userName,
    userImage,
  ]);

  /* STREAM CLIENT LOADING */

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
    <StreamVideo client={client}>
      {children}
    </StreamVideo>
  );
};

/* =========================================================
   MAIN STREAM PROVIDER
========================================================= */

const StreamVideoProvider = ({
  children,
}: StreamVideoProviderProps) => {
  const {
    user,
    isLoaded,
    isSignedIn,
  } = useUser();

  const apiKey =
    process.env.NEXT_PUBLIC_STREAM_API_KEY;

  /* CLERK LOADING */

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

  /*
   * Logged-out users don't
   * need Stream.
   */
  if (!isSignedIn || !user) {
    return <>{children}</>;
  }

  /* CHECK STREAM KEY */

  if (!apiKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F0E0]">
        <div className="rounded-2xl bg-[#FFF7EB] p-6 text-center shadow-sm">
          <p className="font-bold text-[#CC3A63]">
            Stream configuration missing
          </p>

          <p className="mt-2 text-sm text-[#756E64]">
            NEXT_PUBLIC_STREAM_API_KEY
            was not found.
          </p>
        </div>
      </div>
    );
  }

  /* CLERK USER → STREAM USER */

  const userName =
    user.fullName ||
    user.username ||
    user.firstName ||
    "Cohiva User";

  return (
    <ConnectedStreamProvider
      apiKey={apiKey}
      userId={user.id}
      userName={userName}
      userImage={user.imageUrl}
    >
      {children}
    </ConnectedStreamProvider>
  );
};

export default StreamVideoProvider;