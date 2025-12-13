import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createHash } from 'node:crypto';
import db from './db';
import { searchAll, getCachedResults, setCachedResults } from './services/search';
import { generateExplanation, chatWithPatent, getAvailableModels, comparePatents } from './services/ai';
import { downloadAndParsePDF } from './services/pdf';
import { scrapeFullText } from './services/scraper';
import { isModelLoaded, loadModel, unloadModel } from './services/embeddings';
import fs from 'fs-extra';
import path from 'path';
import { PDFParse } from 'pdf-parse';

const app = new Hono();
app.use('/*', cors());

const PDF_DIR = process.env.PDF_DIR || path.join(__dirname, '../data/pdfs');
if (!fs.existsSync(PDF_DIR)) fs.ensureDirSync(PDF_DIR);

app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`);
  return c.json({ error: err.message }, 500);
});

app.get('/', (c) => c.text('Patent Hub API is running'));

app.get('/api/config', (c) => c.json({
  models: getAvailableModels(),
  embeddingModelLoaded: isModelLoaded()
}));

app.get('/api/admin/embedding-status', (c) => c.json({ loaded: isModelLoaded() }));
app.post('/api/admin/embedding-load', async (c) => { await loadModel(); return c.json({ loaded: true }); });
app.post('/api/admin/embedding-unload', (c) => { unloadModel(); return c.json({ loaded: false }); });

app.get('/api/stats', (c) => {
  const stats = {
    patents: (db.query('SELECT COUNT(*) as count FROM patents').get() as any).count,
    searches: (db.query('SELECT COUNT(*) as count FROM search_history').get() as any).count,
    indexed: (db.query('SELECT COUNT(*) as count FROM patents WHERE full_text IS NOT NULL').get() as any).count,
    chats: (db.query('SELECT COUNT(*) as count FROM chat_history').get() as any).count
  };
  return c.json(stats);
});

app.get('/api/search', async (c) => {
  const query = c.req.query('q');
  const page = parseInt(c.req.query('page') || '1');
  const refresh = c.req.query('refresh') === 'true';

  if (!query) return c.json({ error: 'Query is required' }, 400);
  
  try {
    db.run('INSERT OR REPLACE INTO search_history (query) VALUES (?)', [query]);
    const maxHistory = parseInt(process.env.SEARCH_HISTORY_MAX || '50');
    db.run("DELETE FROM search_history WHERE query IS NULL OR trim(query) = ''");
    db.run(`DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY created_at DESC LIMIT ?)`, [maxHistory]);
  } catch (e) {}

  if (!refresh) {
    const cached = await getCachedResults(query, page);
    if (cached) return c.json(cached);
  }

  const results = await searchAll(query, page);
  setCachedResults(query, page, results);
  return c.json(results);
});

app.post('/api/patents/from-url', async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: 'URL is required' }, 400);

  const id = `sng-${createHash('md5').update(url).digest('hex').substring(0, 16)}`;
  
  db.run(`
    INSERT INTO patents (id, title, abstract, url, source)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `, [id, 'Loading...', 'Fetching details...', url, new URL(url).hostname.replace('www.', '')]);

  try {
    await scrapeFullText(id, url);
    const patent = db.query('SELECT * FROM patents WHERE id = ?').get(id) as any;
    return c.json({ ...patent, inventors: JSON.parse(patent.inventors || '[]'), has_full_text: !!patent.full_text });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/api/history', (c) => c.json(db.query('SELECT query FROM search_history ORDER BY created_at DESC LIMIT 20').all()));
app.delete('/api/history', (c) => { db.run('DELETE FROM search_history'); return c.json({ success: true }); });

app.get('/api/patents', (c) => {
  const { type, q, categoryId } = c.req.query();
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  
  let queryStr = 'SELECT p.id, p.title, p.source, p.publication_date, p.created_at FROM patents p';
  const conditions = [];
  const params: any[] = [];

  if (categoryId) {
    queryStr += ' JOIN patent_categories pc ON p.id = pc.patent_id';
    conditions.push('pc.category_id = ?');
    params.push(categoryId);
  }
  if (type === 'upload') conditions.push('p.id LIKE "upl-%"');
  if (q) {
    conditions.push('(p.title LIKE ? OR p.abstract LIKE ? OR p.full_text LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (conditions.length > 0) queryStr += ' WHERE ' + conditions.join(' AND ');
  queryStr += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);
  
  const patents = db.query(queryStr).all(...params) as any[];
  const patentsWithCats = patents.map(p => ({
    ...p,
    categories: db.query(`SELECT c.* FROM categories c JOIN patent_categories pc ON c.id = pc.category_id WHERE pc.patent_id = ?`).all(p.id)
  }));

  return c.json(patentsWithCats);
});

app.post('/api/patents/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    if (!file) return c.json({ error: 'No file' }, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();
    await parser.destroy();

    const id = `upl-${createHash('md5').update(buffer).digest('hex').substring(0, 16)}`;
    const filePath = path.join(PDF_DIR, `${id}.pdf`);
    await fs.writeFile(filePath, buffer);

    const fullText = text || '';
    const abstract = fullText.substring(0, 500);

    db.run(`
      INSERT INTO patents (id, title, abstract, source, full_text, pdf_path, publication_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, full_text=excluded.full_text, pdf_path=excluded.pdf_path
    `, [id, file.name.replace(/\.[^/.]+$/, ""), abstract, 'Local Upload', fullText, filePath, new Date().toISOString().split('T')[0]]);

    const { chunkText, generateEmbedding } = await import('./services/embeddings');
    const chunks = chunkText(fullText);
    db.run('DELETE FROM patent_chunks WHERE patent_id = ?', [id]);
    for (const chunk of chunks) {
      if (chunk.trim().length < 20) continue;
      const embedding = await generateEmbedding(chunk);
      db.run('INSERT INTO patent_chunks (patent_id, content, embedding) VALUES (?, ?, ?)', [id, chunk, Buffer.from(new Float32Array(embedding).buffer)]);
    }

    return c.json({ id, title: file.name, success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/api/patents', async (c) => {
  const data = await c.req.json();
  const inventorsStr = JSON.stringify(Array.isArray(data.inventors) ? data.inventors : []);

  db.run(`
    INSERT INTO patents (id, title, abstract, inventors, publication_date, url, pdf_url, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, abstract=excluded.abstract, inventors=excluded.inventors, source=excluded.source
  `, [data.id, data.title, data.abstract, inventorsStr, data.publication_date, data.url, data.pdf_url, data.source]);

  return c.json(db.query('SELECT * FROM patents WHERE id = ?').get(data.id));
});

app.get('/api/patents/:id', (c) => {
  const patent = db.query('SELECT * FROM patents WHERE id = ?').get(c.req.param('id')) as any;
  if (!patent) return c.json({ error: 'Not found' }, 404);
  return c.json({ 
    ...patent, 
    inventors: JSON.parse(patent.inventors || '[]'), 
    history: db.query('SELECT role, content, model, created_at FROM chat_history WHERE patent_id = ? ORDER BY created_at ASC').all(patent.id),
    has_full_text: !!patent.full_text,
    pdf_localized: !!patent.pdf_path
  });
});

app.delete('/api/patents/:id', async (c) => {
  const id = c.req.param('id');
  const patent = db.query('SELECT pdf_path FROM patents WHERE id = ?').get(id) as any;
  if (patent?.pdf_path) await fs.remove(patent.pdf_path).catch(() => {});
  db.run('DELETE FROM patents WHERE id = ?', [id]);
  return c.json({ success: true });
});

app.post('/api/patents/:id/explain', async (c) => {
  const patent = db.query('SELECT * FROM patents WHERE id = ?').get(c.req.param('id')) as any;
  if (!patent) return c.json({ error: 'Not found' }, 404);
  const { model } = await c.req.json().catch(() => ({}));
  const explanation = await generateExplanation(patent.id, patent.title, patent.abstract, model);
  return c.json({ explanation });
});

app.post('/api/patents/:id/chat', async (c) => {
  const { message, model } = await c.req.json();
  const id = c.req.param('id');
  const history = db.query('SELECT role, content FROM chat_history WHERE patent_id = ? ORDER BY created_at ASC').all(id);
  const { reply, citations } = await chatWithPatent(id, message, history, model);
  return c.json({ reply, citations });
});

app.post('/api/patents/:id/process-pdf', async (c) => {
  const id = c.req.param('id');
  const patent = db.query('SELECT * FROM patents WHERE id = ?').get(id) as any;
  if (!patent) return c.json({ error: 'Not found' }, 404);
  
  try {
    if (patent.pdf_url) {
      await downloadAndParsePDF(id, patent.pdf_url, patent.title);
      return c.json({ success: true });
    }
    await scrapeFullText(id, patent.url);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.get('/api/patents/:id/pdf', async (c) => {
  const patent = db.query('SELECT pdf_path FROM patents WHERE id = ?').get(c.req.param('id')) as any;
  if (!patent?.pdf_path || !fs.existsSync(patent.pdf_path)) return c.json({ error: 'Not found' }, 404);
  return c.body(await fs.readFile(patent.pdf_path), 200, { 'Content-Type': 'application/pdf' });
});

app.get('/api/categories', (c) => c.json(db.query('SELECT * FROM categories ORDER BY name ASC').all()));
app.post('/api/categories', async (c) => {
  const { name } = await c.req.json();
  try { db.run('INSERT INTO categories (name) VALUES (?)', [name]); return c.json({ success: true }); }
  catch (e) { return c.json({ error: 'Exists' }, 400); }
});

app.get('/api/settings', (c) => {
  const settings = db.query('SELECT * FROM application_settings').all() as any[];
  return c.json(settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {}));
});

app.post('/api/settings', async (c) => {
  const settings = await c.req.json();
  for (const [key, value] of Object.entries(settings)) db.run('INSERT OR REPLACE INTO application_settings (key, value) VALUES (?, ?)', [key, String(value)]);
  return c.json({ success: true });
});

export default { port: process.env.PORT || 3000, fetch: app.fetch };
