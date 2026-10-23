import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

// Only keys in this exact shape are ever read or written, which blocks path traversal outright.
// Unlike storage/localStorage.js, this root is never mounted with express.static -- these files
// (partner verification documents) must never be reachable by URL, only through an authenticated route.
// Keys already carry the "partner-docs/" prefix (mirroring storage/localStorage.js's "hotels/" keys),
// so the configured root (config.partner.docsDir) must NOT repeat it.
const KEY_PATTERN = /^partner-docs\/\d+\/[0-9a-f-]{36}\.(jpg|png|pdf)$/;

class PrivateStorage {
  constructor(directory) {
    this.root = path.resolve(directory);
  }

  assertKey(key) {
    if (!KEY_PATTERN.test(key)) throw new Error(`Refusing unsafe storage key: ${key}`);
  }

  resolve(key) {
    this.assertKey(key);
    const target = path.join(this.root, key);
    if (!target.startsWith(this.root + path.sep)) throw new Error('Storage path escaped its root');
    return target;
  }

  async put(key, buffer) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: 'wx' });
  }

  async read(key) {
    return readFile(this.resolve(key));
  }

  async remove(key) {
    await rm(this.resolve(key), { force: true });
  }
}

let instance;

export function getPrivateStorage() {
  instance ??= new PrivateStorage(config.partner.docsDir);
  return instance;
}

/** Test seam: lets the suite point storage at a temporary directory. */
export function resetPrivateStorageForTests() {
  instance = undefined;
}
