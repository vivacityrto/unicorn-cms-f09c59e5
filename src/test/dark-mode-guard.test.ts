import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The client portal follows the chosen theme, so a surface that only looks right in light mode
 * is a bug. These checks catch the two mistakes that have already shipped:
 *  1. a pale fixed colour (white, slate-100, gray-100...) used as a surface with no dark variant, and
 *  2. a heading on a brand-coloured banner that is left to inherit the theme's heading colour,
 *     which put dark titles on the purple gradient in dark mode.
 */
const ROOT = join(process.cwd(), 'src');
const CLIENT_DIRS = ['components/client', 'pages/client'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const lines = (file: string) => readFileSync(file, 'utf8').split('\n');

describe('dark mode guard', () => {
  it('client surfaces do not use pale fixed colours as backgrounds without a dark variant', () => {
    // Overlays on a coloured header (bg-white/20) are fine; a solid pale surface is not.
    const pale = /(?<![\w:-])bg-(white|slate-(50|100|200)|gray-(50|100|200))(?![\w/-])/;
    const offenders: string[] = [];
    for (const dir of CLIENT_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        lines(file).forEach((line, i) => {
          if (pale.test(line) && !/dark:bg-/.test(line)) offenders.push(`${file.replace(ROOT, 'src')}:${i + 1}: ${line.trim().slice(0, 110)}`);
        });
      }
    }
    // Sign-in style buttons that sit on a purple header keep white on purpose.
    const allowed = offenders.filter((o) => !/SupportTicketsPortalPage|AcademyAssessmentResultPage/.test(o));
    expect(allowed).toEqual([]);
  });

  it('headings on a brand gradient banner are protected by brand-surface or an explicit colour', () => {
    const offenders: string[] = [];
    const brand = /from-\[#44235F\][^"'`]*to-\[#7130A0\](?!\/)/;
    for (const file of walk(ROOT)) {
      const L = lines(file);
      L.forEach((line, i) => {
        if (!brand.test(line) || /\/\d+\]/.test(line.match(brand)?.[0] ?? '')) return;
        const block = [line, ...L.slice(i + 1, i + 14)].join('\n');
        const heading = /<(h[1-6]|DialogTitle|CardTitle|SheetTitle)\b([^>]*)>/.exec(block);
        const protectedHere = /brand-surface/.test(line) || (heading && /text-white|!text-white/.test(heading[2]));
        if (heading && !protectedHere) offenders.push(`${file.replace(ROOT, 'src')}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
