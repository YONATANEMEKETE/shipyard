import app from './app.js';

const port = Number(process.env.API_PORT ?? 4000);

app.listen(port, () => {
  console.log(`Shipyard API listening on http://localhost:${port}`);
});
