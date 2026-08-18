import 'dotenv/config';
import app from './app.js';
import { env } from './common/config/env.js';

app.listen(env.API_PORT, () => {
  console.log(`Shipyard API listening on http://localhost:${env.API_PORT}`);
});
