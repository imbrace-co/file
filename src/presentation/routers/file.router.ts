import { Hono } from "hono";
import FileController from "../controllers/file.controller";

/**
 * File routes for Hono
 */
const fileRouter = new Hono();
const fileController = new FileController();

// File upload - multipart form data
fileRouter.post("/upload", fileController.upload);

// File download
fileRouter.get("/download/:fileName", fileController.download);

// Delete file
fileRouter.delete("/:fileName", fileController.deleteFile);

// Generate single presigned URL
fileRouter.get("/presigned-url/:fileName", fileController.generatePresignedUrl);

// Generate batch presigned URLs
fileRouter.post("/presigned-urls", fileController.generateBatchPresignedUrls);

export default fileRouter;
