import { StreamClient } from "@stream-io/node-sdk";

/* =========================================================
   SHARED STREAM SERVER CLIENT

   Next.js route handlers can be invoked many times during a
   meeting. Reusing one SDK client per warm server instance
   avoids repeatedly constructing identical server clients.
========================================================= */

type GlobalWithStreamClient = typeof globalThis & {
  __cohivaStreamServerClient?: StreamClient;
};

const globalForStream =
  globalThis as GlobalWithStreamClient;

export const getStreamServerClient = () => {
  const apiKey =
    process.env.NEXT_PUBLIC_STREAM_API_KEY;

  const apiSecret =
    process.env.STREAM_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Stream server configuration is missing."
    );
  }

  if (!globalForStream.__cohivaStreamServerClient) {
    globalForStream.__cohivaStreamServerClient =
      new StreamClient(
        apiKey,
        apiSecret,
        {
          timeout: 10_000,
        }
      );
  }

  return globalForStream.__cohivaStreamServerClient;
};
