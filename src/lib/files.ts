import type { InlineFile } from './ai';

const MAX_SIDE = 2000;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

export class FileError extends Error {}

/**
 * A photo or PDF picked on the phone, ready to send to the model inline.
 * Photos are scaled down (a receipt stays readable at 2000px) to keep the request small.
 */
export async function fileToInline(file: File): Promise<InlineFile> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF_BYTES) throw new FileError('הקובץ גדול מדי (עד 15MB).');
    return { mimeType: 'application/pdf', data: await toBase64(file) };
  }
  if (!file.type.startsWith('image/')) throw new FileError('אפשר לבחור תמונה או PDF.');
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.85);
    return { mimeType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
  } catch {
    // a format the browser can't draw (HEIC on some phones): send as is
    return { mimeType: file.type || 'image/jpeg', data: await toBase64(file) };
  }
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(new FileError('לא הצלחתי לקרוא את הקובץ.'));
    r.readAsDataURL(file);
  });
}
