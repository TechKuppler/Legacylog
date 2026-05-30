require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const DB_HOST     = process.env.DB_HOST     || 'localhost';
const DB_PORT     = parseInt(process.env.DB_PORT || '5432', 10);
const DB_USER     = process.env.DB_USER     || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME     = process.env.DB_NAME     || 'legacylog';

// Try backend/database first (Railway), fall back to root database folder (local)
const SCHEMA_PATH = fs.existsSync(path.resolve(__dirname, '../../database/schema.sql'))
  ? path.resolve(__dirname, '../../database/schema.sql')
  : path.resolve(__dirname, '../../../database/schema.sql');

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
    'SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]
  );

  if (!rows.length) {
    await adminClient.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`[Migrate] Database "${DB_NAME}" created.`);
  } else {
    console.log(`[Migrate] Database "${DB_NAME}" already exists.`);
  }

  await adminClient.end();

  // ── Step 2: Run schema ────────────────────────────────────────────────────
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

  // ── Step 3: Seed admin user ───────────────────────────────────────────────
  const ADMIN_EMAIL    = 'admin@kuppler.in';
  const ADMIN_PASSWORD = 'Admin@1234';

  const { rows: existing } = await schemaClient.query(
    'SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]
  );

  if (existing.length) {
    await schemaClient.query(
      'UPDATE users SET must_change_password = FALSE, role = $1 WHERE email = $2',
      ['admin', ADMIN_EMAIL]
    );
    console.log(`[Migrate] Admin user already exists: ${ADMIN_EMAIL}`);
  } else {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await schemaClient.query(
      `INSERT INTO users (name, email, password_hash, role, must_change_password)
       VALUES ('Admin', $1, $2, 'admin', FALSE)`,
      [ADMIN_EMAIL, hash]
    );
    console.log(`[Migrate] Admin user created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  }

  await schemaClient.end();
};

run().catch((err) => {
  console.error('[Migrate] Migration failed:', err.message);
  process.exit(1);
});
