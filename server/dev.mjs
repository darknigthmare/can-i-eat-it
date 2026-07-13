import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server/server.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'inherit' }),
];

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(error);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 1);
  });
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
