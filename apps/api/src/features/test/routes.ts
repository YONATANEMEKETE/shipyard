import { Router } from 'express';

import { env } from '../../common/config/env.js';
import { prisma } from '../../common/db/client.js';

export const testRouter = Router();

testRouter.post('/mark-verified', async (request, response) => {
  if (env.NODE_ENV === 'production') {
    response
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    return;
  }

  const email = (request.body as { email?: unknown })?.email;
  if (typeof email !== 'string' || !email.includes('@')) {
    response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'email is required' },
    });
    return;
  }

  await prisma.user.update({
    where: { email },
    data: { emailVerified: true },
  });

  response.json({ data: { ok: true } });
});
