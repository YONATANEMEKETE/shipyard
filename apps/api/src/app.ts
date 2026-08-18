import express from 'express';

export function createApp() {
  const app = express();
  app.use(express.json());
  return app;
}
