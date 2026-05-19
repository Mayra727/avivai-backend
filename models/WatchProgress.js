import mongoose from "mongoose";

const watchProgressSchema =
new mongoose.Schema({

  userId:{
    type:String,
    required:true
  },

  courseId:{
    type:String,
    required:true
  },

  lessonId:{
    type:String,
    required:true
  },

  videoTime:{
    type:Number,
    default:0
  },

  updatedAt:{
    type:Date,
    default:Date.now
  }

});

export default mongoose.model(
  "WatchProgress",
  watchProgressSchema
);