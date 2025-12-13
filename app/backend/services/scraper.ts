import axios from 'axios';
import * as cheerio from 'cheerio';
import db from '../db';
import { chunkText, generateEmbedding } from './embeddings';

export async function scrapeFullText(patentId: string, url: string) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);

    let fullText = '';
    let pdfUrl = '';
    let title = '';
    let abstract = '';
    let inventors: string[] = [];
    let publicationNumber = '';
    let publicationDate = '';

    if (url.includes('patents.google.com')) {
      title = $('h1').first().text().replace(' - Google Patents', '').trim();
      abstract = $('section[itemprop="abstract"] .abstract').text() || $('.abstract').text();
      publicationNumber = $('[itemprop="publicationNumber"]').first().text().trim();
      publicationDate = $('time[itemprop="publicationDate"]').first().text().trim() || $('[itemprop="publicationDate"]').first().text().trim();
      
      $('[itemprop="inventor"]').each((_, el) => {
        const name = $(el).text().trim();
        if (name && !inventors.includes(name)) inventors.push(name);
      });

      const descText = $('section[itemprop="description"]').text() || $('.description').text();
      const claimsText = $('section[itemprop="claims"]').text() || $('.claims').text();
      fullText = (descText + '\n\n' + claimsText).trim() || $('body').text();
      
      pdfUrl = $('a[href*="patentimages.storage.googleapis.com"]').first().attr('href') || '';
      if (!pdfUrl) {
        $('a').each((_, el) => {
          const href = $(el).attr('href');
          if (href?.includes('patentimages.storage.googleapis.com')) {
            pdfUrl = href;
            return false;
          }
        });
      }
    } else if (url.includes('arxiv.org')) {
      title = $('.title').text().replace('Title:', '').trim();
      abstract = $('.abstract').text().replace('Abstract:', '').trim();
      fullText = `TITLE: ${title}\n\nABSTRACT: ${abstract}`;
      pdfUrl = url.replace('/abs/', '/pdf/') + '.pdf';
    } else if (url.includes('pubmed.ncbi.nlm.nih.gov')) {
      title = $('.heading-title').text().trim();
      abstract = $('.abstract-content').text() || $('.abstract').text();
      fullText = abstract;
      const pmcLink = $('a[href*="/pmc/articles/PMC"]').first().attr('href');
      if (pmcLink) pdfUrl = new URL(pmcLink.endsWith('/') ? pmcLink + 'pdf/' : pmcLink + '/pdf/', 'https://www.ncbi.nlm.nih.gov').href;
    }

    if (!pdfUrl) {
      const metaPdf = $('meta[name="citation_pdf_url"]').attr('content') || $('link[rel="alternate"][type="application/pdf"]').attr('href');
      if (metaPdf) pdfUrl = new URL(metaPdf, url).href;
    }

    if (fullText.length > 100 || pdfUrl || title) {
      const updates: string[] = [];
      const values: any[] = [];
      
      if (fullText.length > 100) { updates.push('full_text = ?'); values.push(fullText); }
      if (pdfUrl) { updates.push('pdf_url = ?'); values.push(pdfUrl); }
      if (title.length > 5) { updates.push('title = ?'); values.push(title); }
      if (abstract.length > 20) { updates.push('abstract = ?'); values.push(abstract); }
      if (inventors.length > 0) { updates.push('inventors = ?'); values.push(JSON.stringify(inventors)); }
      if (publicationNumber) { updates.push('publication_number = ?'); values.push(publicationNumber); }
      if (publicationDate) { updates.push('publication_date = ?'); values.push(publicationDate); }
      
      if (updates.length > 0) {
        values.push(patentId);
        db.run(`UPDATE patents SET ${updates.join(', ')} WHERE id = ?`, values);
      }

      if (fullText.length > 500) {
        const chunks = chunkText(fullText);
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
      return fullText;
    }
    return null;
  } catch (error) {
    console.error(`Scraping error for ${patentId}:`, error);
    return null;
  }
}
