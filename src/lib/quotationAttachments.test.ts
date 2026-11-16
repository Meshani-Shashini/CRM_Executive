// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authBypass: true,
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  createSignedUrl: vi.fn(),
  from: vi.fn(),
}));

vi.mock('./supabase', () => ({
  get AUTH_BYPASS() { return mocks.authBypass; },
  TENANT_ID: 'tenant-test',
  supabase: { storage: { from: mocks.from } },
}));

import { resolveQuotationAttachmentUrl, uploadQuotationAttachment } from './quotationAttachments';

describe('quotation attachments', () => {
  beforeEach(() => {
    mocks.authBypass = true;
    mocks.upload.mockReset().mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: 'https://storage.example/quote.pdf' } });
    mocks.createSignedUrl.mockReset().mockResolvedValue({
      data: { signedUrl: 'https://storage.example/signed/quote.pdf' },
      error: null,
    });
    mocks.from.mockReset().mockReturnValue({
      upload: mocks.upload,
      getPublicUrl: mocks.getPublicUrl,
      createSignedUrl: mocks.createSignedUrl,
    });
  });

  it('stores a local data URL in demo mode', async () => {
    const attachment = await uploadQuotationAttachment(
      new File(['quote'], 'quote.pdf', { type: 'application/pdf' }),
      'request-1',
      'line-1',
    );

    expect(attachment).toMatchObject({
      name: 'quote.pdf',
      url: 'data:application/pdf;base64,cXVvdGU=',
    });
    expect(attachment.uploadedAt).toBeTruthy();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uploads to tenant-scoped Supabase Storage outside demo mode and signs on access', async () => {
    mocks.authBypass = false;
    const attachment = await uploadQuotationAttachment(
      new File(['quote'], 'quote doc.pdf', { type: 'application/pdf' }),
      'request-1',
      'line-1',
    );

    expect(mocks.from).toHaveBeenCalledWith('quotation-attachments');
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^tenant-test\/quotation-requests\/request-1\/line-1\/qrs-attachment-.+quote_doc\.pdf$/),
      expect.any(File),
      expect.objectContaining({ upsert: false }),
    );
    expect(attachment).toMatchObject({
      name: 'quote doc.pdf',
      url: 'https://storage.example/quote.pdf',
      storageBucket: 'quotation-attachments',
    });
    await expect(resolveQuotationAttachmentUrl(attachment))
      .resolves.toBe('https://storage.example/signed/quote.pdf');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(attachment.storagePath, 3600);
  });

  it('rejects attachments above the supported size limit', async () => {
    const oversized = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.pdf');
    await expect(uploadQuotationAttachment(oversized, 'request-1', 'line-1'))
      .rejects.toThrow(/8 MB attachment limit/);
  });
});
