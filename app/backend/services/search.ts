import axios from 'axios';
import db from '../db';
import { createHash } from 'node:crypto';

export interface PatentResult {
  id: string;
  title: string;
  abstract: string;
  inventors: string[];
  publication_date: string;
  url: string;
  pdf_url?: string;
  source: string;
  engine?: string;
}

const CACHE_TTL_HOURS = 24;

export async function getCachedResults(query: string, page: number): Promise<PatentResult[] | null> {
  const cacheKey = `${query}:${page}`;
  try {
    const row = db.query('SELECT results, created_at FROM search_cache WHERE cache_key = ?').get(cacheKey) as { results: string, created_at: string } | undefined;
    
    if (row) {
      const createdAt = new Date(row.created_at).getTime();
      const ageHours = (Date.now() - createdAt) / (1000 * 60 * 60);
      
      if (ageHours < CACHE_TTL_HOURS) {
        return JSON.parse(row.results);
      }
      db.run('DELETE FROM search_cache WHERE cache_key = ?', [cacheKey]);
    }
  } catch (e) {}
  return null;
}

export function setCachedResults(query: string, page: number, results: PatentResult[]) {
  const cacheKey = `${query}:${page}`;
  try {
    db.run(
      'INSERT OR REPLACE INTO search_cache (cache_key, results, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [cacheKey, JSON.stringify(results)]
    );
  } catch (e) {}
}

export async function searchUSPTO(query: string, page = 1): Promise<PatentResult[]> {
  try {
    const response = await axios.get('https://search.patentsview.org/api/v1/patent', {
      params: {
        query: JSON.stringify({
          "_or": [
            { "_contains": { "patent_title": query } },
            { "_contains": { "patent_abstract": query } }
          ]
        }),
        limit: 25,
        offset: (page - 1) * 25
      },
      headers: { 'Accept': 'application/json' }
    });

    if (!response.data?.results) return [];

    return response.data.results.map((p: any) => ({
      id: p.patent_id,
      title: p.patent_title,
      abstract: p.patent_abstract || '',
      inventors: p.inventors ? p.inventors.map((i: any) => i.inventor_last_name).filter(Boolean) : [],
      publication_date: p.patent_date,
      url: `https://patents.google.com/patent/${p.patent_id}/en`,
      pdf_url: `https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/${p.patent_id.replace(/[^0-9]/g, '')}`,
      source: 'USPTO'
    }));
  } catch (error) {
    return [];
  }
}

export async function searchSearXNG(query: string, page = 1): Promise<PatentResult[]> {
  try {
    const SEARXNG_URL = process.env.SEARXNG_URL || 'http://searxng:8080/search';
    const engines = process.env.SEARXNG_ENGINES || 'google_scholar,arxiv,pubmed,google_patents';

    const baseParams = { q: query, format: 'json', engines, pageno: page };

    const search = async (q: string) => 
      axios.get(SEARXNG_URL, { params: { ...baseParams, q }, timeout: 10000 })
        .then(r => r.data?.results || [])
        .catch(() => []);

    const allResults = await Promise.all([
      search(query),
      search(`${query} site:patents.google.com/patent`),
      search(`${query} site:arxiv.org/abs`),
      search(`${query} site:pubmed.ncbi.nlm.nih.gov`)
    ]);

    const combined = allResults.flat();
    const seen = new Set<string>();
    
    return combined
      .filter(r => {
        if (!r.url || seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      })
      .map(r => {
        const url = r.url;
        let pdf_url: string | undefined;
        let source = r.engine ? r.engine.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : 'Web';

        if (url.includes('patents.google.com')) source = 'Google Patents';
        else if (url.includes('arxiv.org')) {
          source = 'arXiv';
          pdf_url = url.replace('/abs/', '/pdf/') + '.pdf';
        } else if (url.includes('pubmed.ncbi.nlm.nih.gov')) source = 'PubMed';

        return {
          id: `sng-${createHash('md5').update(url).digest('hex').substring(0, 16)}`,
          title: r.title,
          abstract: r.content || '',
          inventors: [],
          publication_date: r.publishedDate || '',
          url,
          pdf_url,
          source,
          engine: r.engine
        };
      });
  } catch (error) {
    return [];
  }
}

export async function searchAll(query: string, page = 1): Promise<PatentResult[]> {
  const [uspto, searxng] = await Promise.all([
    searchUSPTO(query, page),
    searchSearXNG(query, page)
  ]);

  const combined = [...uspto, ...searxng];
  const seenUrls = new Set<string>();
  
  return combined.filter(p => {
    if (!p.url || seenUrls.has(p.url)) return false;
    seenUrls.add(p.url);
    return true;
  });
}
