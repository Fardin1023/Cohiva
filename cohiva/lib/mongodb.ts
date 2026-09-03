import mongoose from "mongoose";

/* =========================================================
   MONGODB CONNECTION
========================================================= */

const MONGODB_URI =
  process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Please define MONGODB_URI in .env.local"
  );
}

/* =========================================================
   GLOBAL CACHE

   Next.js development reloads modules frequently.

   Without caching, every refresh could create another
   MongoDB connection.
========================================================= */

type MongooseCache = {
  conn:
    typeof mongoose | null;

  promise:
    Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache:
    MongooseCache | undefined;
}

const cached:
  MongooseCache =
  global.mongooseCache ??
  {
    conn: null,
    promise: null,
  };

if (
  process.env.NODE_ENV !==
  "production"
) {
  global.mongooseCache =
    cached;
}

/* =========================================================
   CONNECT
========================================================= */

const connectMongoDB =
  async () => {
    if (cached.conn) {
      return cached.conn;
    }

    if (!cached.promise) {
      cached.promise =
        mongoose.connect(
          MONGODB_URI,
          {
            bufferCommands:
              false,
          }
        );
    }

    try {
      cached.conn =
        await cached.promise;
    } catch (error) {
      cached.promise =
        null;

      throw error;
    }

    return cached.conn;
  };

export default connectMongoDB;