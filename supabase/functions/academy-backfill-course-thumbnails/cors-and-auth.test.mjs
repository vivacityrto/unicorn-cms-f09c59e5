import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('academy thumbnail backfill keeps Super Admin auth behind request-aware CORS', () => {
  assert.match(source, /import \{ corsHeaders \} from '\.\.\/_shared\/cors\.ts'/);
  assert.match(source, /function json\(req: Request, body: unknown, status = 200\)/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin'\s*:\s*'\*'/);
  assert.doesNotMatch(source, /return json\((?!req,)/);
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /userData\?\.unicorn_role !== 'Super Admin'/);
});
