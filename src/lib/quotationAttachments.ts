import type { QuotationRequestLineAttachment } from '../types';
import { AUTH_BYPASS, supabase, TENANT_ID } from './supabase';

export const MAX_QUOTATION_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const QUOTATION_ATTACHMENT_BUCKET = 'quotation-attachments';

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Could not read ${file.name}.`));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadQuotationAttachment(
  file: File,
  requestId: string,
  lineId: string,
): Promise<QuotationRequestLineAttachment> {
  if (file.size > MAX_QUOTATION_ATTACHMENT_SIZE) {
    throw new Error(`${file.name} exceeds the 8 MB attachment limit.`);
  }
  const id = `qrs-attachment-${crypto.randomUUID()}`;
  const uploadedAt = new Date().toISOString();
  if (AUTH_BYPASS) {
    return { id, name: file.name, url: await readAsDataUrl(file), uploadedAt };
  }

  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-120) || 'quotation-document';
  const storagePath = `${TENANT_ID}/quotation-requests/${requestId}/${lineId}/${id}-${safeName}`;
  const storage = supabase.storage.from(QUOTATION_ATTACHMENT_BUCKET);
  const { error } = await storage.upload(storagePath, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
  const { data } = storage.getPublicUrl(storagePath);
  return {
    id,
    name: file.name,
    url: data.publicUrl,
    uploadedAt,
    storagePath,
    storageBucket: QUOTATION_ATTACHMENT_BUCKET,
  };
}

export async function resolveQuotationAttachmentUrl(attachment: QuotationRequestLineAttachment) {
  if (!attachment.storagePath) return attachment.url;
  const { data, error } = await supabase.storage
    .from(attachment.storageBucket ?? QUOTATION_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storagePath, 60 * 60);
  if (error) throw new Error(`Could not access ${attachment.name}: ${error.message}`);
  return data.signedUrl;
}
