import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { upload } from '../../../../src/middleware/upload.middleware';

const createApp = () => {
  const app = express();

  app.post('/upload', upload.single('image'), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(400).json({ message: err.message, code: err.code });
  });

  return app;
};

describe('upload.middleware', () => {
  it('rejects unsupported mime type', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/upload')
      .attach('image', Buffer.from('bad'), {
        filename: 'bad.gif',
        contentType: 'image/gif'
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only jpeg, png, and webp/i);
  });

  it('rejects file larger than 5MB', async () => {
    const app = createApp();
    const tooLarge = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const res = await request(app)
      .post('/upload')
      .attach('image', tooLarge, {
        filename: 'big.png',
        contentType: 'image/png'
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LIMIT_FILE_SIZE');
  });
});
