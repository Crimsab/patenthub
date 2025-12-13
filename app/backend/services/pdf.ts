import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import db from '../db';
import { chunkText, generateEmbedding } from './embeddings';

const PDF_DIR = process.env.PDF_DIR || path.join(__dirname, '../../data/pdfs');

if (!fs.existsSync(PDF_DIR)) {
  fs.ensureDirSync(PDF_DIR);
}

export async function downloadAndParsePDF(patentId: string, pdfUrl: string, title?: string) {
  let fileName = `${patentId.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  
  if (title) {
    const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
    fileName = `${cleanTitle}_${patentId.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  }
  
  const filePath = path.join(PDF_DIR, fileName);

  try {
    const existing = db.query('SELECT pdf_path FROM patents WHERE id = ?').get(patentId) as any;
    if (existing?.pdf_path && existing.pdf_path !== filePath && fs.existsSync(existing.pdf_path)) {
      await fs.remove(existing.pdf_path).catch(() => {});
    }

    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(filePath, response.data);

    const parser = new PDFParse({ data: response.data });
    const data = await parser.getText();
    const pdfText = data.text;
    await parser.destroy();

    const existingData = db.query('SELECT full_text FROM patents WHERE id = ?').get(patentId) as any;
    const existingText = existingData?.full_text || '';
    
    const isScanned = pdfText.trim().length < 2000 && pdfText.includes('--') && !pdfText.includes('the');
    let finalFullText = existingText;

    if (!isScanned || existingText.length < 500) {
      if (pdfText.length > 500) finalFullText = pdfText;
    }

    if (!finalFullText || finalFullText.length < 200) {
      const patent = db.query('SELECT url FROM patents WHERE id = ?').get(patentId) as any;
      if (patent?.url) {
        try {
          const { scrapeFullText } = await import('./scraper');
          const scrapedText = await scrapeFullText(patentId, patent.url);
          if (scrapedText) finalFullText = scrapedText;
        } catch (e) {}
      }
    }

    db.run('UPDATE patents SET full_text = ?, pdf_path = ? WHERE id = ?', [finalFullText, filePath, patentId]);

    if (finalFullText && finalFullText !== existingText) {
      const chunks = chunkText(finalFullText);
      db.run('DELETE FROM patent_chunks WHERE patent_id = ?', [patentId]);
      
      for (const chunk of chunks) {
        if (chunk.trim().length < 20) continue;
        const embedding = await generateEmbedding(chunk);
        db.run(
          'INSERT INTO patent_chunks (patent_id, content, embedding) VALUES (?, ?, ?)',
          [patentId, chunk, Buffer.from(new Float32Array(embedding).buffer)]
        );
      }
    }

    return { fullText: finalFullText, filePath };
  } catch (error) {
    console.error(`Error processing PDF for ${patentId}:`, error);
    throw error;
  }
}

export function getLocalPDFPath(patentId: string) {
  const patent = db.query('SELECT pdf_path FROM patents WHERE id = ?').get(patentId) as any;
  return (patent?.pdf_path && fs.existsSync(patent.pdf_path)) ? patent.pdf_path : null;
}
