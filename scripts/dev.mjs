import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const npmCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const services = [
  { name: 'BACKEND', color: '\u001b[34m', directory: 'backend' },
  { name: 'FRONTEND', color: '\u001b[32m', directory: 'frontend' },
];
const reset = '\u001b[0m';
const children = new Set();
let stopping = false;

function pipeLines(stream, service, writer) {
  createInterface({ input: stream }).on('line', (line) => {
    writer(`${service.color}[${service.name}]${reset} ${line}`);
  });
}

function start(service) {
  const npmArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm --prefix ${service.directory} run dev`]
    : ['--prefix', service.directory, 'run', 'dev'];
  const child = spawn(npmCommand, npmArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.add(child);
  pipeLines(child.stdout, service, console.log);
  pipeLines(child.stderr, service, console.error);

  child.on('error', (error) => {
    console.error(`${service.color}[${service.name}]${reset} Could not start: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (stopping) return;
    console.error(
      `${service.color}[${service.name}]${reset} stopped unexpectedly (${signal ?? `exit ${code ?? 1}`}). Stopping the other service.`,
    );
    void shutdown(code ?? 1);
  });

  return child;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForBackend() {
  const target = process.env.VITE_API_PROXY_TARGET ?? `http://localhost:${process.env.PORT ?? 4000}`;
  const healthUrl = new URL('/api/health', target).toString();
  const deadline = Date.now() + 60_000;

  console.log(`\u001b[36m[DEV]\u001b[0m Waiting for backend readiness at ${healthUrl}`);
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        const health = await response.json();
        if (health.status === 'ok' && health.database === 'up') {
          console.log('\u001b[36m[DEV]\u001b[0m Backend is ready; starting frontend.');
          return;
        }
      }
    } catch {
      // Normal while the API is still connecting to the database and completing startup work.
    }
    await delay(500);
  }

  if (!stopping) throw new Error('Backend did not become ready within 60 seconds.');
}

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    killer.once('exit', resolve);
    killer.once('error', resolve);
  });
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all([...children].map(stop));
  process.exit(exitCode);
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

async function main() {
  start(services[0]);
  try {
    await waitForBackend();
    if (!stopping) start(services[1]);
  } catch (error) {
    console.error(`\u001b[31m[DEV]\u001b[0m ${error.message}`);
    await shutdown(1);
  }
}

void main();
