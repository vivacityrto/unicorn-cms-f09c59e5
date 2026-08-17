import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./graph-app-client.ts', import.meta.url), 'utf8');

test('SharePoint folder-name sanitization removes terminal periods', () => {
  assert.match(source, /\.replace\(\/\\\.\+\$\//);
  assert.match(source, /SP_ILLEGAL_CHARS/);
});
