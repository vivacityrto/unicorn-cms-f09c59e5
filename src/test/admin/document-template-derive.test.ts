import { describe, expect, it } from 'vitest';
import {
  deriveCategoryFromFilename,
  deriveFrameworkFromRootFolder,
  deriveFormatFromFile,
} from '@/features/document-templates/derive';

describe('deriveCategoryFromFilename', () => {
  const categories = [
    { id: 'cp-credential_policy', name: 'Credential Policy' },
    { id: 'gto-nsw-documents', name: 'GTO Documents NSW' },
    { id: 'gto-vic-documents', name: 'GTO Documents VIC' },
  ];

  it('matches on a unique leading code token', () => {
    expect(deriveCategoryFromFilename('CP.S3-Validation-2026.03.00.docx', categories)).toBe(
      'cp-credential_policy',
    );
  });

  it('returns null when the leading token matches more than one category', () => {
    expect(deriveCategoryFromFilename('GTO-Handbook.docx', categories)).toBeNull();
  });

  it('returns null when no filename token is found', () => {
    expect(deriveCategoryFromFilename('', categories)).toBeNull();
  });

  it('returns null when the token matches no category', () => {
    expect(deriveCategoryFromFilename('ZZ.Unknown.docx', categories)).toBeNull();
  });
});

describe('deriveFrameworkFromRootFolder', () => {
  const frameworks = [
    { value: 'RTO', label: 'RTO' },
    { value: 'GTO', label: 'GTO' },
  ];

  it('matches an exact (case-insensitive) folder name', () => {
    expect(deriveFrameworkFromRootFolder('rto', frameworks)).toBe('RTO');
  });

  it('matches a folder name that starts with a framework value', () => {
    expect(deriveFrameworkFromRootFolder('GTO Documents', frameworks)).toBe('GTO');
  });

  it('returns null for a null root folder', () => {
    expect(deriveFrameworkFromRootFolder(null, frameworks)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(deriveFrameworkFromRootFolder('CRICOS', frameworks)).toBeNull();
  });
});

describe('deriveFormatFromFile', () => {
  it('prefers the file extension over the mime type', () => {
    expect(deriveFormatFromFile('policy.DOCX', 'application/pdf')).toBe('docx');
  });

  it('falls back to a mapped mime type when there is no extension', () => {
    expect(
      deriveFormatFromFile(
        'policy',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('xlsx');
  });

  it('returns an empty string when neither extension nor mime type resolve', () => {
    expect(deriveFormatFromFile('policy', null)).toBe('');
  });
});
