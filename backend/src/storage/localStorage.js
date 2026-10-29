import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Only keys in this exact shape are ever read or written, which blocks path traversal outright.
const KEY_PATTERN = /^(hotels|rooms|offers|homepage)\/\d+\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export class LocalStorage {
  constructor({ directory, publicBasePath }) {
    this.root = path.resolve(directory);
    this.publicBasePath = publicBasePath.replace(/\/+$/, '');
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

  async remove(key) {
    await rm(this.resolve(key), { force: true });
  }

  publicUrl(key) {
    this.assertKey(key);
    return `${this.publicBasePath}/${key}`;
  }

  get directory() {
    return this.root;
  }
}
