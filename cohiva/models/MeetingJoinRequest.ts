import {
  Schema,
  model,
  models,
} from "mongoose";

const MeetingJoinRequestSchema =
  new Schema(
    {
      callId: {
        type: String,
        required: true,
        index: true,
      },

      userId: {
        type: String,
        required: true,
        index: true,
      },

      name: {
        type: String,
        default:
          "Participant",
      },

      image: {
        type: String,
        default: "",
      },

      status: {
        type: String,
        enum: [
          "pending",
          "approved",
          "denied",
        ],
        default:
          "pending",
        index: true,
      },

      requestedAt: {
        type: Date,
        default:
          Date.now,
      },

      decidedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

MeetingJoinRequestSchema.index(
  {
    callId: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);

const MeetingJoinRequest =
  models.MeetingJoinRequest ||
  model(
    "MeetingJoinRequest",
    MeetingJoinRequestSchema
  );

export default MeetingJoinRequest;