import mongoose, { Schema, models } from "mongoose";

export type RateLimitBucketDocument = {
  key: string;
  count: number;
  resetAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const RateLimitBucketSchema = new Schema<RateLimitBucketDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      maxlength: 64,
    },
    count: {
      type: Number,
      required: true,
      min: 0,
    },
    resetAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

RateLimitBucketSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitBucket =
  models.RateLimitBucket ||
  mongoose.model<RateLimitBucketDocument>("RateLimitBucket", RateLimitBucketSchema);

export default RateLimitBucket;
