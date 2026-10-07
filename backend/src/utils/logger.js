const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? LEVELS.info;

function write(level, scope, message, meta) {
  if (LEVELS[level] < threshold) return;
  const line = { time: new Date().toISOString(), level, scope, message, ...(meta ? { meta } : {}) };
  const sink = level === 'error' ? console.error : console.log;
  sink(JSON.stringify(line));
}

export function createLogger(scope) {
  return {
    debug: (message, meta) => write('debug', scope, message, meta),
    info: (message, meta) => write('info', scope, message, meta),
    warn: (message, meta) => write('warn', scope, message, meta),
    error: (message, meta) => write('error', scope, message, meta),
  };
}
