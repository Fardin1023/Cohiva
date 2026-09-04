import {
  Schema,
  model,
  models,
} from "mongoose";

/* =========================================================
   TYPE
========================================================= */

export type MeetingChatMessageDocument = {
  callId: string;

  messageId: string;

  senderId: string;

  senderName: string;

  senderImage: string;

  text: string;

  createdAt: Date;
};

/* =========================================================
   SCHEMA
========================================================= */

const MeetingChatMessageSchema =
  new Schema<MeetingChatMessageDocument>(
    {
      callId: {
        type: String,
        required: true,
        trim: true,
      },

      messageId: {
        type: String,
        required: true,
        trim: true,
      },

      senderId: {
        type: String,
        required: true,
        trim: true,
      },

      senderName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },

      senderImage: {
        type: String,
        default: "",
        maxlength: 1000,
      },

      text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
      },

      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      versionKey: false,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

/*
 * Prevent duplicate messages.
 *
 * partialFilterExpression also keeps this compatible
 * with any older Cohiva chat documents that may not
 * have had messageId.
 */
MeetingChatMessageSchema.index(
  {
    callId: 1,
    messageId: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      messageId: {
        $type: "string",
      },
    },
  }
);

/*
 * Fast history lookup.
 */
MeetingChatMessageSchema.index({
  callId: 1,
  createdAt: -1,
});

/* =========================================================
   MODEL
========================================================= */

const MeetingChatMessage =
  models.MeetingChatMessage ||
  model<MeetingChatMessageDocument>(
    "MeetingChatMessage",
    MeetingChatMessageSchema
  );

export default MeetingChatMessage;