import {run} from './app.js';

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
