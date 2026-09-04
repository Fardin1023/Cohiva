import {
  Schema,
  model,
  models,
} from "mongoose";

const MeetingChatMessageSchema =
  new Schema(
    {
      callId: {
        type: String,
        required: true,
        index: true,
      },

      senderId: {
        type: String,
        required: true,
        index: true,
      },

      senderName: {
        type: String,
        required: true,
        default: "Participant",
      },

      senderImage: {
        type: String,
        default: "",
      },

      text: {
        type: String,
        required: true,
        maxlength: 1500,
      },
    },
    {
      timestamps: true,
    }
  );

MeetingChatMessageSchema.index({
  callId: 1,
  createdAt: 1,
});

const MeetingChatMessage =
  models.MeetingChatMessage ||
  model(
    "MeetingChatMessage",
    MeetingChatMessageSchema
  );

export default MeetingChatMessage;