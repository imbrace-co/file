/**
 * Legacy MongoDB connection file
 * Now using MongoDB adapter from mongodb-adapter.ts
 * This file is kept for backward compatibility during migration
 */
import mongoAdapter from "./mongodb.adapter";

export const connectDB = async (): Promise<void> => {
  await mongoAdapter.connect();
};

export default { connect: connectDB };
