import mongoose, {
  Schema,
  models,
} from "mongoose";

export type PasswordResetTokenDocument = {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const PasswordResetTokenSchema =
  new Schema<PasswordResetTokenDocument>(
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
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

PasswordResetTokenSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
    name: "expire_password_reset_tokens",
  }
);

const PasswordResetToken =
  models.PasswordResetToken ||
  mongoose.model<PasswordResetTokenDocument>(
    "PasswordResetToken",
    PasswordResetTokenSchema
  );

export default PasswordResetToken;
