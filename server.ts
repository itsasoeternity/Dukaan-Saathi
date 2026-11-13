/**
 * Local / Node-host entry point. Serves the API from src/server/app.ts plus the React app
 * (Vite dev middleware in development, the built dist/ folder in production).
 * On Vercel the same API runs from api/index.ts instead.
 */
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from './src/server/app';
import { startCrmTimer } from './src/server/crm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
  }
  app.listen(PORT, () => console.log(JSON.stringify({ event: 'server_started', port: PORT })));
  // Sends scheduled CRM messages automatically when WhatsApp Cloud API is configured.
  startCrmTimer();
}

startServer();
