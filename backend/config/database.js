import mongoose from "mongoose";

// Connects Mongoose to the database named in MONGO_URI. It returns the connection
// promise and throws a connection error so the caller can decide how to report it.
export default async function connectDatabase() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from the environment.");
  }

  return mongoose.connect(process.env.MONGO_URI);
}
