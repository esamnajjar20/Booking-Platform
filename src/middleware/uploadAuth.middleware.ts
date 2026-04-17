import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth.middleware';

/**
 * Middleware wrapper to protect upload endpoints
 * Ensures only authenticated users can upload files
 */


export const protectUploads = (req: Request, res: Response, next: NextFunction) => {
  authenticate(req, res, next);
};