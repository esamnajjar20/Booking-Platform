import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  correlationId?: string;
  timestamp: string;
}

export class ResponseWrapper {
  static success<T>(res: Response, data: T, message?: string, status: number = 200): void {
    res.status(status).json({ success: true, data, message, timestamp: new Date().toISOString() });
  }
  static error(res: Response, error: string, status: number = 500, code?: string, correlationId?: string): void {
    res.status(status).json({ success: false, error, code, correlationId, timestamp: new Date().toISOString() });
  }
  static paginated<T>(res: Response, data: T[], total: number, page: number, limit: number, message?: string): void {
    res.status(200).json({
      success: true,
      data: {
        items: data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      },
      message,
      timestamp: new Date().toISOString()
    });
  }
}