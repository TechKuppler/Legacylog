require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const bcrypt = require('bcrypt');
const pool   = require('../config/db');

// ─── Seed Constants ───────────────────────────────────────────────────────────
const ADMIN_NAME     = 'Admin';
const ADMIN_EMAIL    = 'admin@kuppler.in';
const ADMIN_PASSWORD = 'Admin@1234';
const BCRYPT_COST    = 12;

const PREDEFINED_TAGS = [
  'Vendor Onboarding', 'Manufacturing', 'Exports', 'HR', 'Finance',
  'Operations', 'Strategy', 'Client Meeting', 'Compliance', 'Training',
];

const DEPARTMENTS = [
  { name: 'HR',               description: 'Human Resources',           color: '#7C3AED' },
  { name: 'Finance',          description: 'Finance & Accounts',         color: '#0891B2' },
  { name: 'Operations',       description: 'General Operations',         color: '#059669' },
  { name: 'Manufacturing',    description: 'Manufacturing & Production',  color: '#D97706' },
  { name: 'Exports',          description: 'Export & Logistics',         color: '#DC2626' },
  { name: 'Strategy',         description: 'Business Strategy',          color: '#7C3AED' },
  { name: 'Vendor Onboarding',description: 'Vendor & Procurement',       color: '#2563EB' },
  { name: 'Client Meeting',   description: 'Client Relations',           color: '#DB2777' },
  { name: 'Compliance',       description: 'Legal & Compliance',         color: '#B45309' },
  { name: 'Training',         description: 'Training & Development',     color: '#16A34A' },
];

// ─── Run Seed ─────────────────────────────────────────────────────────────────
const run = async () => {
  try {
    // ── Admin user ──────────────────────────────────────────────────────────
    let adminId;
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );

    if (existing.length) {
      adminId = existing[0].id;
      // Ensure admin never gets must_change_password flag
      await pool.query(
        'UPDATE users SET must_change_password = FALSE, role = $1 WHERE id = $2',
        ['admin', adminId]
      );
      console.log(`[Seed] Admin already exists: ${ADMIN_EMAIL}`);
    } else {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST);
      const { rows: [{ id }] } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, must_change_password)
         VALUES ($1,$2,$3,'admin',FALSE) RETURNING id`,
        [ADMIN_NAME, ADMIN_EMAIL, passwordHash]
      );
      adminId = id;
      console.log(`[Seed] Admin user created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    }

    // ── Predefined tags ──────────────────────────────────────────────────────
    for (const tagName of PREDEFINED_TAGS) {
      await pool.query(
        'INSERT INTO tags (name, is_predefined) VALUES ($1, TRUE) ON CONFLICT (name) DO NOTHING',
        [tagName]
      );
    }
    console.log(`[Seed] ${PREDEFINED_TAGS.length} predefined tags seeded.`);

    // ── Departments ──────────────────────────────────────────────────────────
    for (const dept of DEPARTMENTS) {
      const { rows: existingDept } = await pool.query(
        'SELECT id FROM departments WHERE name = $1',
        [dept.name]
      );

      let deptId;
      if (existingDept.length) {
        deptId = existingDept[0].id;
      } else {
        const { rows: [{ id }] } = await pool.query(
          `INSERT INTO departments (name, description, color, created_by)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [dept.name, dept.description, dept.color, adminId]
        );
        deptId = id;
      }

      // Link the matching predefined tag to this department
      await pool.query(
        `INSERT INTO department_tags (department_id, tag_id)
         SELECT $1, t.id FROM tags t WHERE t.name = $2 AND t.is_predefined = TRUE
         ON CONFLICT DO NOTHING`,
        [deptId, dept.name]
      );
    }
    console.log(`[Seed] ${DEPARTMENTS.length} departments seeded.`);

    process.exit(0);
  } catch (err) {
    console.error('[Seed] Failed:', err.message);
    process.exit(1);
  }
};

run();
