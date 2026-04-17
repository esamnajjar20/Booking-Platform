import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';

const storage = multer.diskStorage({
  // Files are stored on local filesystem under /uploads directory
  destination: (req, file, cb) => cb(null, 'uploads/'),

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    // UUID prevents filename collisions and avoids exposing original filenames
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  // Restrict uploads to safe image formats only
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Reject unsupported file types to reduce risk of malicious uploads
    cb(new Error('Only JPEG, PNG, and WEBP images are allowed'));
  }
};

export const upload = multer({
  storage,

  fileFilter,

  // File size limit (5MB) to prevent abuse / disk exhaustion attacks
  limits: { fileSize: 5 * 1024 * 1024 }
});