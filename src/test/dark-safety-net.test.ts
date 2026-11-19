import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CSS = join(ROOT, 'src', 'styles', 'dark-safety-net.css');

describe('dark safety net', () => {
  it('is up to date with its generator', () => {
    const before = readFileSync(CSS, 'utf8');
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'generate-dark-safety-net.mjs')], { stdio: 'ignore' });
    expect(readFileSync(CSS, 'utf8')).toBe(before);
  });

  it('remaps pale backgrounds, text and borders in dark mode only, and leaves light scopes and overlays alone', () => {
    const css = readFileSync(CSS, 'utf8');
    expect(css).toContain(':where(.dark) .bg-yellow-50:not(:where(.light, .light *, .keep-light, .keep-light *))');
    expect(css).toContain(String.raw`:where(.dark) .bg-amber-50\/50:not(`);
    expect(css).toContain(':where(.dark) .text-amber-800:not(');
    expect(css).toContain(':where(.dark) .border-blue-200:not(');
    expect(css).toContain(':where(.dark) .bg-white:not(');
    // text-black usually sits on a bright fixed background that stays bright in dark mode, so it is left alone.
    expect(css).not.toContain('text-black');
    // bg-white/20 is an overlay on a coloured surface; it must never be turned into a card colour.
    expect(css).not.toContain(String.raw`bg-white\/`);
    // Every rule is behind :where(.dark), so light mode is untouched.
    const selectors = css.split('{').filter((chunk) => chunk.includes(':where('));
    expect(selectors.length).toBeGreaterThan(100);
    for (const chunk of css.split('}')) {
      const sel = chunk.split('{')[0].replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (sel) expect(sel.split(/,\n/).every((s) => s.trim().startsWith(':where(.dark)'))).toBe(true);
    }
  });
});
