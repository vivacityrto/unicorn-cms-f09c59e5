import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const slug of ['get-email-status', 'report-delivery-issue']) {
  test(`${slug} forwards the caller Authorization header`, () => {
    const source = fs.readFileSync(`supabase/functions/${slug}/index.ts`, 'utf8');
    assert.match(source, /const authHeader = req\.headers\.get\(['"]Authorization['"]\) \?\? ['"]['"];?/);
    assert.match(source, /global:\s*\{\s*headers:\s*\{\s*Authorization:\s*authHeader/);
  });
}
