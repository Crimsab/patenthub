import { Database } from "bun:sqlite";
import { join } from "path";

const dbPath = process.env.DATABASE_URL || join(__dirname, "../data/patents.sqlite");
const db = new Database(dbPath, { create: true });

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 5000;");

db.run(`
  CREATE TABLE IF NOT EXISTS patents (
    id TEXT PRIMARY KEY,
    title TEXT,
    abstract TEXT,
    inventors TEXT,
    publication_date TEXT,
    url TEXT,
    pdf_url TEXT,
    pdf_path TEXT,
    full_text TEXT,
    publication_number TEXT,
    ai_explanation TEXT,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS patent_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patent_id TEXT,
    content TEXT,
    embedding BLOB,
    FOREIGN KEY(patent_id) REFERENCES patents(id) ON DELETE CASCADE
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS patent_categories (
    patent_id TEXT,
    category_id INTEGER,
    PRIMARY KEY (patent_id, category_id),
    FOREIGN KEY(patent_id) REFERENCES patents(id) ON DELETE CASCADE,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patent_id TEXT,
    role TEXT,
    content TEXT,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patent_id) REFERENCES patents(id) ON DELETE CASCADE
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS search_cache (
    cache_key TEXT PRIMARY KEY,
    results TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS application_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const defaultSettings = [
  ['ai_vector_default_on', 'false'],
  ['system_prompt_explanation', 'Explain the following patent in a simple and concise way. Focus on the main innovation.'],
  ['system_prompt_chat', 'You are an AI assistant specialized in patents.'],
  ['system_prompt_comparison', 'Compare the following two documents and identify similarities and differences.']
];

for (const [key, value] of defaultSettings) {
  db.run('INSERT OR IGNORE INTO application_settings (key, value) VALUES (?, ?)', [key, value]);
}

export default db;
