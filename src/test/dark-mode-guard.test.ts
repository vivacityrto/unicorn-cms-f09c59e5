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
  it('no screen uses a pale fixed colour as a surface without a dark variant', () => {
    // A pale fixed background (white, yellow-50, blue-100...) with theme text inside turns into
    // light-on-light in dark mode (the L10 Issues and Headlines rows). Add a dark:bg- variant in the same class string.
    // Overlays such as bg-white/20 are fine; so is white used on a coloured button, which is listed below.
    const pale = /(?<![\w:-])bg-(white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200))(?![\w/-])/;
    const literal = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g;
    const allowed = ['settings/ProfileBanner.tsx', 'SupportTicketsPortalPage', 'AcademyAssessmentResultPage'];
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      if (allowed.some((a) => file.replace(/\\/g, '/').includes(a))) continue;
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(literal)) {
        if (pale.test(m[0]) && !/dark:bg-|keep-light/.test(m[0])) {
          offenders.push(`${file.replace(ROOT, 'src')}: ${m[0].slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('pills with a solid colour set their own text colour instead of inheriting the badge variant', () => {
    // <Badge className="bg-green-600"> keeps the variant's cyan text, which is unreadable on green.
    const bad = /<Badge[^>]*className="[^"]*(?<![\w:-])bg-(?:red|orange|amber|yellow|green|emerald|teal|blue|indigo|violet|purple|pink|rose)-[4-8]00(?![\w/-])[^"]*"/;
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(new RegExp(bad.source, 'g'))) {
        if (!/(?<![\w:-])text-(?!xs|sm|\[|base|lg)/.test(m[0])) offenders.push(`${file.replace(ROOT, 'src')}: ${m[0].slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
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
