import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Client portal pages sit inside the layout's own padding. A centred `container mx-auto` (or a fixed max width on the
 * page root) leaves wide empty margins on a large screen, which has been reported on Academy Activity, Staff PDPs and
 * Packages. Pages fill the width they are given.
 */
const ROOT = process.cwd();
const DIRS = ['src/pages/client', 'src/components/client'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('client page width', () => {
  it('no client page centres itself in a container', () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (/\bcontainer mx-auto\b/.test(line)) offenders.push(`${file.replace(ROOT, '')}:${i + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  }, 30_000);

  it('the Packages page does not cap its width', () => {
    const src = readFileSync(join(ROOT, 'src/components/client/ClientPackagesPage.tsx'), 'utf8');
    expect(src).not.toMatch(/w-full max-w-7xl/);
  });
});
