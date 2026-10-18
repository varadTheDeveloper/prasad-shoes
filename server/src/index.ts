import { createApp } from './app';
import { env } from './env';

// Listen on localhost only: Nginx is the only thing that talks to the API from outside.
const host = process.env.HOST ?? '127.0.0.1';
createApp().listen(env.port, host, () => {
  console.log(`Prasad Shoes API listening on http://${host}:${env.port}`);
});
