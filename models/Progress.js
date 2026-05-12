import mongoose from "mongoose";

const progressSchema =
  new mongoose.Schema({

    userId: {
      type: String,
      required: true
    },

    courseId: {
      type: String,
      required: true
    },

    lessonId: {
      type: String,
      required: true
    },

    completed: {
      type: Boolean,
      default: false
    }

  }, {
    timestamps: true
  });

export default mongoose.model(
  "Progress",
  progressSchema
);