// Starts a Vite dev server for the browser tests.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function ping(url) {
  return new Promise((res) => {
    http.get(url, (r) => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false));
  });
}

async function startServer(port = 5183) {
  const url = `http://localhost:${port}/`;
  if (await ping(url)) return { url, stop() {} };
  const root = path.join(__dirname, '..');
  const proc = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    if (await ping(url)) return { url, stop: () => proc.kill() };
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('Vite server did not start');
}

const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
module.exports = { startServer, GL_ARGS };
