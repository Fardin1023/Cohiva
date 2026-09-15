import mongoose, { Schema, models } from "mongoose";

export type CohivaRtcRoomDocument = {
  callId: string;
  hostUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

const CohivaRtcRoomSchema = new Schema<CohivaRtcRoomDocument>(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    hostUserId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const CohivaRtcRoom =
  models.CohivaRtcRoom ||
  mongoose.model<CohivaRtcRoomDocument>("CohivaRtcRoom", CohivaRtcRoomSchema);

export default CohivaRtcRoom;
