/**
 * Storage Service — abstraction over file storage.
 *
 * Currently: local disk (./uploads).
 * Future: swap PROVIDER to 's3' or 'gcs' without touching controllers.
 *
 * Interface:
 *   savePath(originalName) → absolute path where file should be saved
 *   getReadStream(storedPath) → ReadableStream
 *   deleteFile(storedPath) → void
 *   fileExists(storedPath) → boolean
 */

const fs   = require('fs');
const path = require('path');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Local disk implementation ────────────────────────────────────────────────
const getUploadDir = () => UPLOAD_DIR;

const fileExists = (storedPath) => fs.existsSync(storedPath);

const getReadStream = (storedPath) => fs.createReadStream(storedPath);

const deleteFile = (storedPath) => {
  if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
};

const getMimeType = (storedPath) => {
  const ext = path.extname(storedPath).toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.webm': 'audio/webm', '.ogg': 'audio/ogg',
    '.pdf':  'application/pdf',
    '.doc':  'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt':  'text/plain',
  };
  return map[ext] || 'application/octet-stream';
};

// ─── Provider info ────────────────────────────────────────────────────────────
const getProviderInfo = () => ({ provider: 'local', uploadDir: UPLOAD_DIR });

module.exports = { getUploadDir, fileExists, getReadStream, deleteFile, getMimeType, getProviderInfo };
