import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const api = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: 'inherit',
});

api.on('error', (error) => console.error('Could not start the MongoDB API process:', error.message));
api.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error('MongoDB API stopped. Configure .env (see MONGODB.md); frontend API requests will return 503 until it starts.');
  }
});
web.on('error', (error) => {
  console.error('Could not start the Vite frontend:', error.message);
  stop();
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of [api, web]) {
    if (child.exitCode === null) child.kill();
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
