import mongoose, { Schema, models } from "mongoose";

export type MeetingRecordingDocument = {
  recordingId: string;
  callId: string;
  hostUserId: string;
  title: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  durationMs: number;
  createdAt: Date;
  updatedAt: Date;
};

const MeetingRecordingSchema = new Schema<MeetingRecordingDocument>(
  {
    recordingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 100,
    },
    callId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 120,
    },
    hostUserId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 128,
    },
    title: {
      type: String,
      default: "Cohiva Meeting",
      trim: true,
      maxlength: 120,
    },
    mimeType: {
      type: String,
      default: "video/webm",
      trim: true,
      maxlength: 100,
    },
    extension: {
      type: String,
      default: "webm",
      trim: true,
      maxlength: 10,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    durationMs: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const MeetingRecording =
  models.MeetingRecording ||
  mongoose.model<MeetingRecordingDocument>(
    "MeetingRecording",
    MeetingRecordingSchema
  );

export default MeetingRecording;
