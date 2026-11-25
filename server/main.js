// Entry point: reads configuration from the environment and starts the server.
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const dbPath = process.env.FETCH_DB ?? 'data/fetch.db';

const server = createApp({ dbPath }).listen(port, () => console.log(`Fetch! listening on :${port}, db ${dbPath}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.closeAllConnections(); // open event streams would otherwise keep the process alive
    server.close(() => process.exit(0));
  });
}
