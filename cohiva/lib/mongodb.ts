import mongoose from "mongoose";

/* =========================================================
   MONGODB CONNECTION

   Cache the Mongoose connection on globalThis so development
   hot reloads and warm production/serverless instances reuse
   the same connection pool instead of opening new sockets.
========================================================= */

const MONGODB_URI =
  process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Please define MONGODB_URI in .env.local"
  );
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache =
  global.mongooseCache ?? {
    conn: null,
    promise: null,
  };

/*
 * Keep the cache in every environment. On Vercel/Node this is
 * reused by warm instances; on local development it also
 * survives Next.js module reloads.
 */
global.mongooseCache = cached;

const connectMongoDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(
      MONGODB_URI,
      {
        bufferCommands: false,

        /*
         * Cohiva performs many short API requests while a
         * meeting is active. A bounded pool avoids excessive
         * connection growth while keeping concurrent requests
         * responsive.
         */
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
      }
    );
  }

  try {
    cached.conn =
      await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
};

export default connectMongoDB;
