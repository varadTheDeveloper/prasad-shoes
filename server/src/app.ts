import express from 'express';
import helmet from 'helmet';
import { env } from './env';
import { errorHandler } from './errors';
import { requireAuth } from './middleware/auth';
import authRoutes, { meRouter } from './routes/auth';
import orderRoutes from './routes/orders';
import labelRoutes from './routes/labels';
import userRoutes, { permissionsRouter } from './routes/users';
import shopRoutes, { statsRouter } from './routes/shop';
import pincodeRoutes from './routes/pincode';
import { pool } from './db';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Nginx
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '1mb' }));

  // CORS – only needed when the website runs on another port in development.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && env.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-File-Name, X-Batch-Id, X-Page-Count');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/me', meRouter);
  app.use('/api/orders', requireAuth, orderRoutes);
  app.use('/api/labels', requireAuth, labelRoutes);
  app.use('/api/users', requireAuth, userRoutes);
  app.use('/api/permissions', requireAuth, permissionsRouter);
  app.use('/api/shop', requireAuth, shopRoutes);
  app.use('/api/stats', requireAuth, statsRouter);
  app.use('/api/pincode', requireAuth, pincodeRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such API' } }));
  app.use(errorHandler);
  return app;
}
