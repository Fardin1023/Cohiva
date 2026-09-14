import mongoose, {
  Schema,
  models,
} from "mongoose";

export type CohivaUserDocument = {
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  imageUrl: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

const CohivaUserSchema =
  new Schema<CohivaUserDocument>(
    {
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: 320,
      },

      firstName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },

      lastName: {
        type: String,
        default: "",
        trim: true,
        maxlength: 80,
      },

      username: {
        type: String,
        default: "",
        trim: true,
        maxlength: 80,
      },

      imageUrl: {
        type: String,
        default: "",
        trim: true,
        maxlength: 1000,
      },

      passwordHash: {
        type: String,
        required: true,
        select: false,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

const CohivaUser =
  models.CohivaUser ||
  mongoose.model<CohivaUserDocument>(
    "CohivaUser",
    CohivaUserSchema
  );

export default CohivaUser;
