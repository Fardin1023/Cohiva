import {
  Schema,
  model,
  models,
} from "mongoose";

/* =========================================================
   WHITEBOARD DOCUMENT
========================================================= */

const WhiteboardStateSchema =
  new Schema(
    {
      /*
       * Stream meeting ID.
       */
      callId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      /*
       * Clerk user who originally
       * created/saved the board.
       */
      ownerId: {
        type: String,
        required: true,
        index: true,
      },

      /*
       * Excalidraw scene elements.
       *
       * Mixed is intentional because
       * Excalidraw element structures
       * contain many different fields.
       */
      elements: {
        type: Schema.Types.Mixed,
        required: true,
        default: [],
      },

      /*
       * Useful later when Cohiva gets
       * a Saved Whiteboards page.
       */
      title: {
        type: String,
        default:
          "Cohiva Whiteboard",
      },

      elementCount: {
        type: Number,
        default: 0,
      },

      lastSavedAt: {
        type: Date,
        default:
          Date.now,
      },
    },
    {
      timestamps: true,
    }
  );

/* =========================================================
   PREVENT MODEL RECOMPILATION

   Important for Next.js hot reload.
========================================================= */

const WhiteboardState =
  models.WhiteboardState ||
  model(
    "WhiteboardState",
    WhiteboardStateSchema
  );

export default WhiteboardState;