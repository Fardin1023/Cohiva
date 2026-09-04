import {
  Schema,
  model,
  models,
} from "mongoose";

export type MeetingAccessMode =
  | "open"
  | "approval"
  | "locked";

const MeetingAccessConfigSchema =
  new Schema(
    {
      callId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      mode: {
        type: String,
        enum: [
          "open",
          "approval",
          "locked",
        ],
        default:
          "approval",
        required: true,
      },

      updatedBy: {
        type: String,
        default: "",
      },
    },
    {
      timestamps: true,
    }
  );

const MeetingAccessConfig =
  models.MeetingAccessConfig ||
  model(
    "MeetingAccessConfig",
    MeetingAccessConfigSchema
  );

export default MeetingAccessConfig;