require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

// ─── Migration Config ─────────────────────────────────────────────────────────
const DB_HOST     = process.env.DB_HOST     || 'localhost';
const DB_PORT     = parseInt(process.env.DB_PORT || '5432', 10);
const DB_USER     = process.env.DB_USER     || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME     = process.env.DB_NAME     || 'legacylog';

const SCHEMA_PATH = path.resolve(__dirname, '../../database/schema.sql');

const run = async () => {
  // ── Step 1: Create database if it doesn't exist ───────────────────────────
  console.log('[Migrate] Connecting to PostgreSQL...');

  const adminClient = new Client({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASSWORD,
    database: 'postgres',
  });

  await adminClient.connect();

  const { rows } = await adminClient.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [DB_NAME]
  );

  if (!rows.length) {
    await adminClient.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`[Migrate] Database "${DB_NAME}" created.`);
  } else {
    console.log(`[Migrate] Database "${DB_NAME}" already exists.`);
  }

  await adminClient.end();

  // ── Step 2: Run schema against the target database ────────────────────────
  // pg supports multiple statements in one query() call when there are no
  // parameters — it uses PostgreSQL's simple query protocol which handles
  // the full SQL file including comments in one shot.
  console.log('[Migrate] Running schema.sql...');

  const schemaClient = new Client({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME,
  });

  await schemaClient.connect();

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await schemaClient.query(schema);

  console.log('[Migrate] Migration complete.');
  await schemaClient.end();
};

run().catch((err) => {
  console.error('[Migrate] Migration failed:', err.message);
  process.exit(1);
});
