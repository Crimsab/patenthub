import { createWorker } from 'tesseract.js';

/**
 * OCR service using Tesseract.js (Local WASM)
 */
export async function performOCR(imagePathOrBuffer: string | Buffer, lang = 'eng') {
  const worker = await createWorker(lang);
  
  try {
    const { data: { text } } = await worker.recognize(imagePathOrBuffer);
    await worker.terminate();
    return text;
  } catch (error) {
    console.error(`[OCR] Error:`, error);
    await worker.terminate();
    throw error;
  }
}
