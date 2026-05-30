/**
 * AI Service — provider-agnostic abstraction layer.
 *
 * Currently backed by AssemblyAI.
 * To swap provider (e.g. Deepgram, OpenAI Whisper, Sarvam AI):
 *   - Implement the same interface in a new file
 *   - Change the PROVIDER export here
 *
 * Future hooks for RAG:
 *   - generateEmbedding(text): Float32Array — for pgvector or Pinecone
 *   - semanticSearch(query, topK): result[] — vector similarity search
 *   - chat(messages, context): string — RAG-augmented chat response
 */

const { enqueueTranscription } = require('../utils/transcriptionQueue');

// ─── Transcription ────────────────────────────────────────────────────────────
/**
 * Enqueue an audio file for transcription.
 * Returns immediately; result is written to DB when AssemblyAI finishes.
 */
const queueTranscription = (experienceId) => {
  enqueueTranscription(experienceId);
};

// ─── Embedding (stub — wire up pgvector / OpenAI embeddings when ready) ────────
const generateEmbedding = async (text) => {
  // TODO: implement with text-embedding-3-small or similar
  // const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
  // return res.data[0].embedding;
  throw new Error('Embedding generation not yet implemented');
};

// ─── RAG Search (stub) ────────────────────────────────────────────────────────
const semanticSearch = async (query, topK = 5) => {
  // TODO: embed query → vector search in pgvector or Pinecone
  throw new Error('Semantic search not yet implemented');
};

// ─── Provider info (for /api/health or admin diagnostics) ─────────────────────
const getProviderInfo = () => ({
  transcription: 'assemblyai',
  embedding:     'not-configured',
  rag:           'not-configured',
});

module.exports = { queueTranscription, generateEmbedding, semanticSearch, getProviderInfo };
