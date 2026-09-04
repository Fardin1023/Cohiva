import {
  Schema,
  model,
  models,
} from "mongoose";

const AttendanceSessionSchema =
  new Schema(
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
      },
    },
    {
      _id: false,
    }
  );

const MeetingAttendanceSchema =
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
        default: "Participant",
      },

      image: {
        type: String,
        default: "",
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

      totalSeconds: {
        type: Number,
        default: 0,
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

const MeetingAttendance =
  models.MeetingAttendance ||
  model(
    "MeetingAttendance",
    MeetingAttendanceSchema
  );

export default MeetingAttendance;