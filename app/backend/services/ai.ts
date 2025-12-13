import axios from 'axios';
import db from '../db';
import { generateEmbedding, cosineSimilarity, isModelLoaded } from './embeddings';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODELS = (process.env.AI_MODELS || "").split(',').filter(Boolean);
const DEFAULT_MODEL = MODELS[0] || "";

async function callOpenRouter(model: string, messages: any[]) {
  if (!model) throw new Error('No AI model configured. Please set AI_MODELS in your environment.');
  return await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: model,
    messages: messages,
  }, {
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.AI_REFERER || 'https://github.com/your-username/patent-hub',
      'X-Title': process.env.AI_TITLE || 'PatentHub',
    }
  });
}

async function callWithFallback(initialModel: string, messages: any[]) {
  const modelsToTry = [initialModel, ...MODELS.filter(m => m !== initialModel)];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await callOpenRouter(model, messages);
      const content = response.data.choices?.[0]?.message?.content;
      
      if (content) {
        return { content, model };
      }
    } catch (error: any) {
      lastError = error;
      const status = error.response?.status;
      if (status === 401) throw error;
      console.warn(`[AI] Model ${model} failed, trying next...`);
    }
  }

  throw lastError || new Error('All models failed to provide a response');
}

export async function generateExplanation(patentId: string, title: string, abstract: string, modelOverride?: string) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set');

  const initialModel = modelOverride || DEFAULT_MODEL;
  const customPromptRow = db.query('SELECT value FROM application_settings WHERE key = ?').get('system_prompt_explanation') as any;
  const systemPrompt = customPromptRow?.value || 'You are a patent expert. Explain the following patent in a simple and concise way (ELI5 style). Focus on the main innovation and the problem it solves.';

  const prompt = `
    ${systemPrompt}
    
    Title: ${title}
    Abstract: ${abstract}
    
    Response language should match the input.
    EXPLANATION:
  `;

  const { content: explanation } = await callWithFallback(initialModel, [{ role: 'user', content: prompt }]);

  db.run('UPDATE patents SET ai_explanation = ? WHERE id = ?', [explanation, patentId]);

  return explanation;
}

export async function chatWithPatent(patentId: string, userMessage: string, history: any[], modelOverride?: string) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('AI Chat is disabled because the API Key is missing.');
  }

  const initialModel = modelOverride || DEFAULT_MODEL;
  const vectorSearchEnabled = isModelLoaded();
  let context = "";
  
  const patent = db.query('SELECT title, abstract FROM patents WHERE id = ?').get(patentId) as any;

  if (vectorSearchEnabled) {
    const userEmbedding = await generateEmbedding(userMessage, false);
    const chunks = db.query('SELECT content, embedding FROM patent_chunks WHERE patent_id = ?').all(patentId) as any[];
    
    if (chunks.length > 0) {
      const scoredChunks = chunks.map(chunk => {
        const bytes = Uint8Array.from(chunk.embedding);
        const embeddingArray = new Float32Array(bytes.buffer);
        return {
          content: chunk.content,
          score: cosineSimilarity(userEmbedding, Array.from(embeddingArray))
        };
      }).sort((a, b) => b.score - a.score).slice(0, 5);
      
      const citations = scoredChunks.map(c => c.content);
      context = `Relevant context from document:\n${citations.join('\n---\n')}`;
      
      const customPromptRow = db.query('SELECT value FROM application_settings WHERE key = ?').get('system_prompt_chat') as any;
      const baseSystemPrompt = customPromptRow?.value || 'You are an AI assistant specialized in patents.';

      const systemPrompt = `${baseSystemPrompt}\nDocument: "${patent?.title}"\nContext:\n${context}`;
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: userMessage }
      ];

      const { content: reply, model: usedModel } = await callWithFallback(initialModel, messages);

      db.run('INSERT INTO chat_history (patent_id, role, content, model) VALUES (?, ?, ?, ?)', [patentId, 'user', userMessage, null]);
      db.run('INSERT INTO chat_history (patent_id, role, content, model) VALUES (?, ?, ?, ?)', [patentId, 'assistant', reply, usedModel]);

      return { reply, citations };
    }
  }

  if (!context) {
    context = `Abstract:\n${patent?.abstract || 'No abstract available.'}`;
  }

  const customPromptRow = db.query('SELECT value FROM application_settings WHERE key = ?').get('system_prompt_chat') as any;
  const baseSystemPrompt = customPromptRow?.value || 'You are an AI assistant specialized in patents.';

  const systemPrompt = `${baseSystemPrompt}\nDocument: "${patent?.title}"\nContext:\n${context}`;
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ];

  const { content: reply, model: usedModel } = await callWithFallback(initialModel, messages);

  db.run('INSERT INTO chat_history (patent_id, role, content, model) VALUES (?, ?, ?, ?)', [patentId, 'user', userMessage, null]);
  db.run('INSERT INTO chat_history (patent_id, role, content, model) VALUES (?, ?, ?, ?)', [patentId, 'assistant', reply, usedModel]);

  return { reply, citations: [] };
}

export async function comparePatents(id1: string, id2: string, modelOverride?: string) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
  
  const p1 = db.query('SELECT title, abstract, full_text FROM patents WHERE id = ?').get(id1) as any;
  const p2 = db.query('SELECT title, abstract, full_text FROM patents WHERE id = ?').get(id2) as any;
  
  if (!p1 || !p2) throw new Error('One or both documents not found');

  const initialModel = modelOverride || DEFAULT_MODEL;
  const customPromptRow = db.query('SELECT value FROM application_settings WHERE key = ?').get('system_prompt_comparison') as any;
  const systemPrompt = customPromptRow?.value || 'Compare the following two documents and identify similarities, differences and overlaps.';

  const prompt = `
    ${systemPrompt}
    Document 1: "${p1.title}"\nAbstract: ${p1.abstract}
    Document 2: "${p2.title}"\nAbstract: ${p2.abstract}
    Response language should match the input.
  `;

  const { content } = await callWithFallback(initialModel, [{ role: 'user', content: prompt }]);
  return content;
}

export function getAvailableModels() {
  return MODELS;
}
