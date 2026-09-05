import mongoose, {
  Schema,
  models,
} from "mongoose";

/* =========================================================
   SESSION SCHEMA
========================================================= */

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

/* =========================================================
   MEETING ATTENDANCE SCHEMA
========================================================= */

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
        default: null,
      },

      lastJoinedAt: {
        type: Date,
        default: null,
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
      },

      joinCount: {
        type: Number,
        default: 0,
      },

      isPresent: {
        type: Boolean,
        default: false,
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

/* =========================================================
   UNIQUE PARTICIPANT PER MEETING

   Same Clerk user cannot have two documents
   for the same meeting.
========================================================= */

MeetingAttendanceSchema.index(
  {
    callId: 1,
    userId: 1,
  },
  {
    unique: true,
    name: "unique_meeting_participant",
  }
);

/* =========================================================
   MODEL
========================================================= */

const MeetingAttendance =
  models.MeetingAttendance ||
  mongoose.model(
    "MeetingAttendance",
    MeetingAttendanceSchema
  );

export default MeetingAttendance;