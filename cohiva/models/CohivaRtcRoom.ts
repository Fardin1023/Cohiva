import mongoose, { Schema, models } from "mongoose";

export type CohivaRtcRoomDocument = {
  callId: string;
  hostUserId: string;
  memberUserIds: string[];
  hiddenForUserIds: string[];
  kind: "instant" | "scheduled" | "personal";
  title: string;
  description: string;
  startsAt: Date | null;
  accessMode: "open" | "approval" | "locked";
  permissions: {
    studentMic: boolean;
    studentCamera: boolean;
    studentScreenShare: boolean;
    studentRecording: boolean;
    studentWhiteboard: boolean;
  };
  individualPermissions: Record<string, Record<string, boolean>>;
  durationMinutes: number;
  maxParticipants: number;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const DEFAULT_COHIVA_RTC_PERMISSIONS = {
  studentMic: true,
  studentCamera: true,
  studentScreenShare: true,
  studentRecording: false,
  studentWhiteboard: false,
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
    memberUserIds: {
      type: [String],
      default: () => [],
      index: true,
    },
    hiddenForUserIds: {
      type: [String],
      default: () => [],
    },
    kind: {
      type: String,
      enum: ["instant", "scheduled", "personal"],
      default: "instant",
      index: true,
    },
    title: {
      type: String,
      default: "Cohiva Meeting",
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    startsAt: {
      type: Date,
      default: null,
      index: true,
    },
    accessMode: {
      type: String,
      enum: ["open", "approval", "locked"],
      default: "approval",
    },
    permissions: {
      type: Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_COHIVA_RTC_PERMISSIONS }),
    },
    individualPermissions: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    durationMinutes: {
      type: Number,
      default: 45,
      min: 1,
      max: 45,
    },
    maxParticipants: {
      type: Number,
      default: 20,
      min: 2,
      max: 20,
    },
    endedAt: {
      type: Date,
      default: null,
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
