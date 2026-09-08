import { StorageAdapter } from "./types";
import S3Adapter from "./adapters/s3.adapter";
import LocalAdapter from "./adapters/local.adapter";
import config from "../../config";
import logger from "../logging/logger";

let storageAdapter: StorageAdapter | null = null;

/**
 * Storage factory that returns the appropriate storage adapter based on configuration
 */
export const initializeStorage = (): StorageAdapter => {
  const storageType = config.storage.type;

  logger.info(`Initializing storage: ${storageType}`);

  switch (storageType) {
    case "s3":
      storageAdapter = new S3Adapter();
      break;
    case "local":
      storageAdapter = new LocalAdapter();
      break;
    default:
      throw new Error(`Unknown storage type: ${storageType}`);
  }

  logger.info(`Storage initialized successfully: ${storageType}`);
  return storageAdapter;
};

export const getStorage = (): StorageAdapter => {
  if (!storageAdapter) {
    throw new Error("Storage not initialized. Call initializeStorage() first.");
  }
  return storageAdapter;
};

export default {
  initialize: initializeStorage,
  getStorage,
};
