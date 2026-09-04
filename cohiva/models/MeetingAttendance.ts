import {
  Schema,
  model,
  models,
} from "mongoose";

type AttendanceSession = {
  joinedAt: Date;

  leftAt?: Date | null;

  durationSeconds: number;
};

export type MeetingAttendanceDocument = {
  callId: string;

  userId: string;

  name: string;

  image: string;

  firstJoinedAt: Date;

  lastJoinedAt: Date;

  lastLeftAt?: Date | null;

  activeSessionStartedAt?: Date | null;

  lastHeartbeatAt?: Date | null;

  totalSeconds: number;

  joinCount: number;

  isPresent: boolean;

  sessions: AttendanceSession[];
};

const AttendanceSessionSchema =
  new Schema<AttendanceSession>(
    {
      joinedAt: {
        type: Date,
        required: true,
      },

      leftAt: {
        type: Date,
        default: null,
      },

      durationSeconds: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    {
      _id: false,
    }
  );

const MeetingAttendanceSchema =
  new Schema<MeetingAttendanceDocument>(
    {
      callId: {
        type: String,
        required: true,
        trim: true,
      },

      userId: {
        type: String,
        required: true,
        trim: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },

      image: {
        type: String,
        default: "",
        maxlength: 1000,
      },

      firstJoinedAt: {
        type: Date,
        required: true,
      },

      lastJoinedAt: {
        type: Date,
        required: true,
      },

      lastLeftAt: {
        type: Date,
        default: null,
      },

      activeSessionStartedAt: {
        type: Date,
        default: null,
      },

      lastHeartbeatAt: {
        type: Date,
        default: null,
      },

      totalSeconds: {
        type: Number,
        default: 0,
        min: 0,
      },

      joinCount: {
        type: Number,
        default: 1,
        min: 1,
      },

      isPresent: {
        type: Boolean,
        default: true,
      },

      sessions: {
        type: [
          AttendanceSessionSchema,
        ],

        default: [],
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

MeetingAttendanceSchema.index(
  {
    callId: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);

MeetingAttendanceSchema.index({
  callId: 1,
  firstJoinedAt: 1,
});

const MeetingAttendance =
  models.MeetingAttendance ||
  model<MeetingAttendanceDocument>(
    "MeetingAttendance",
    MeetingAttendanceSchema
  );

export default MeetingAttendance;