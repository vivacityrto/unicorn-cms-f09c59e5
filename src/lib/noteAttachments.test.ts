import { describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ upload }) } },
}));

import {
  checkNoteAttachments,
  mergeNoteAttachments,
  NOTE_ATTACHMENT_MAX_BYTES,
  uploadNoteAttachments,
} from './noteAttachments';

const file = (name: string, size = 100) => {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('checkNoteAttachments', () => {
  it('accepts allowed types under the size limit', () => {
    const { accepted, errors } = checkNoteAttachments([file('a.pdf'), file('b.DOCX'), file('c.png')], 0);
    expect(accepted).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  it('rejects disallowed types, including no extension', () => {
    const { accepted, errors } = checkNoteAttachments([file('run.exe'), file('noext')], 0);
    expect(accepted).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });

  it('rejects files over 10 MB', () => {
    const { accepted, errors } = checkNoteAttachments([file('big.pdf', NOTE_ATTACHMENT_MAX_BYTES + 1)], 0);
    expect(accepted).toHaveLength(0);
    expect(errors[0]).toContain('10 MB');
  });

  it('caps a note at 5 files, counting files already attached', () => {
    const picked = [file('1.pdf'), file('2.pdf'), file('3.pdf')];
    const { accepted, errors } = checkNoteAttachments(picked, 3);
    expect(accepted.map((f) => f.name)).toEqual(['1.pdf', '2.pdf']);
    expect(errors).toHaveLength(1);
  });
});

describe('mergeNoteAttachments', () => {
  it('drops removed files and appends new uploads, keeping names aligned', () => {
    const merged = mergeNoteAttachments(
      [{ path: '1/a.pdf', name: 'a.pdf' }, { path: '1/b.pdf', name: 'b.pdf' }],
      ['1/a.pdf'],
      { paths: ['1/c.pdf'], names: ['c.pdf'] },
    );
    expect(merged).toEqual({ paths: ['1/b.pdf', '1/c.pdf'], names: ['b.pdf', 'c.pdf'] });
  });
});

describe('uploadNoteAttachments', () => {
  it('stores under the tenant id folder with a sanitised name and keeps the original display name', async () => {
    upload.mockImplementation(async (path: string) => ({ data: { path }, error: null }));
    const result = await uploadNoteAttachments(42, [file('My Report (final).pdf')]);
    expect(result.paths[0]).toMatch(/^42\/\d+-[a-z0-9]+-My_Report_final_.pdf$/);
    expect(result.names).toEqual(['My Report (final).pdf']);
  });

  it('throws when storage rejects the upload', async () => {
    upload.mockResolvedValue({ data: null, error: new Error('denied') });
    await expect(uploadNoteAttachments(42, [file('a.pdf')])).rejects.toThrow('denied');
  });
});
