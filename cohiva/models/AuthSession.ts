import mongoose, {
  Schema,
  models,
} from "mongoose";

export type AuthSessionDocument = {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const AuthSessionSchema =
  new Schema<AuthSessionDocument>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "CohivaUser",
        required: true,
        index: true,
      },

      tokenHash: {
        type: String,
        required: true,
        unique: true,
      },

      expiresAt: {
        type: Date,
        required: true,
      },

      lastUsedAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

/*
 * MongoDB removes expired sessions in the background. Every auth
 * lookup also checks expiresAt directly, so authorization does not
 * depend on the TTL cleanup interval.
 */
AuthSessionSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
    name: "expire_auth_sessions",
  }
);

const AuthSession =
  models.AuthSession ||
  mongoose.model<AuthSessionDocument>(
    "AuthSession",
    AuthSessionSchema
  );

export default AuthSession;
