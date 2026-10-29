import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalStorage } from '../../src/storage/localStorage.js';
import { detectImageType } from '../../src/utils/imageSignature.js';

test('local storage only accepts server-generated keys', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gk-storage-'));
  try {
    const storage = new LocalStorage({ directory: dir, publicBasePath: '/media' });
    const good = 'hotels/7/0b1d2c3e-4f50-4a61-8b72-9c83d4e5f601.jpg';
    await storage.put(good, Buffer.from([0xff, 0xd8, 0xff]));
    assert.equal(storage.publicUrl(good), `/media/${good}`);

    const offer = 'offers/9/1b2d3c4e-5f60-4a71-8b82-9c93d4e5f612.webp';
    await storage.put(offer, Buffer.from('RIFF\0\0\0\0WEBP', 'binary'));
    assert.equal(storage.publicUrl(offer), `/media/${offer}`);

    const homepage = 'homepage/1/2b3d4c5e-6f70-4a81-8b92-9ca3d4e5f623.webp';
    await storage.put(homepage, Buffer.from('RIFF\0\0\0\0WEBP', 'binary'));
    assert.equal(storage.publicUrl(homepage), `/media/${homepage}`);

    for (const bad of ['../secret.jpg', 'hotels/7/../../x.jpg', 'hotels/7/photo.jpg', '/etc/passwd', 'hotels/7/0b1d2c3e-4f50-4a61-8b72-9c83d4e5f601.exe']) {
      await assert.rejects(() => storage.put(bad, Buffer.from('x')), /unsafe storage key/, bad);
      assert.throws(() => storage.publicUrl(bad), /unsafe storage key/, bad);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('image type is detected from bytes, not from the name', () => {
  assert.deepEqual(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), { mime: 'image/jpeg', ext: 'jpg' });
  assert.deepEqual(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), { mime: 'image/png', ext: 'png' });
  assert.deepEqual(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary')), { mime: 'image/webp', ext: 'webp' });
  assert.equal(detectImageType(Buffer.from('<svg></svg>')), null);
  assert.equal(detectImageType(Buffer.from('GIF89a')), null);
});
