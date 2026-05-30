require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const routes = require('./routes');

// ─── App Instance ─────────────────────────────────────────────────────────────
const app = express();

// ─── Environment Constants ────────────────────────────────────────────────────
const PORT         = process.env.PORT         || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow localhost for local dev
    if (origin.includes('localhost')) return callback(null, true);
    // Allow any Vercel deployment URL
    if (origin.includes('vercel.app')) return callback(null, true);
    // Allow the configured FRONTEND_URL
    if (origin === FRONTEND_URL) return callback(null, true);
    callback(null, true); // allow all for internal tool
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] LegacyLog backend running on port ${PORT}`);
  console.log(`[Server] Accepting requests from: ${FRONTEND_URL}`);
  console.log(`[Server] File storage: PostgreSQL BYTEA`);
});
