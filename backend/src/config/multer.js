const multer = require('multer');
const path   = require('path');

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10);

const ALLOWED_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.ogg', '.webm',
  '.pdf',
  '.doc', '.docx',
  '.txt',
]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    const err = new Error(`Unsupported file type: ${ext}`);
    err.status = 400;
    cb(err, false);
  }
};

// Files are stored in memory (Buffer) and then saved to PostgreSQL as BYTEA.
// No uploads folder needed — everything lives in the database.
const upload = multer({
  storage:    multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

module.exports = upload;
