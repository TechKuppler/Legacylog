const pool = require('../config/db');

// ─── getContentFilter ─────────────────────────────────────────────────────────
// Returns { whereClause, params } for use in the experiences SELECT query.
// Table alias "e" must be used for experiences in the calling query.
// Admin: no filter. Member: own uploads + dept-tagged + directly-tagged content.
async function getContentFilter(user) {
  if (user.role === 'admin') {
    return { whereClause: 'TRUE', params: [] };
  }

  const [{ rows: depts }, { rows: directTags }] = await Promise.all([
    pool.query('SELECT department_id FROM user_departments WHERE user_id = $1', [user.id]),
    pool.query('SELECT tag_id FROM user_tags WHERE user_id = $1', [user.id]),
  ]);

  const deptIds = depts.map((d) => d.department_id);
  const tagIds  = directTags.map((t) => t.tag_id);

  // Only own uploads if no dept and no direct tags
  if (!deptIds.length && !tagIds.length) {
    return { whereClause: 'e.uploaded_by = $1', params: [user.id] };
  }

  const clauses = ['e.uploaded_by = $1'];
  const params  = [user.id];

  if (deptIds.length) {
    const ph = deptIds.map((_, i) => `$${params.length + i + 1}`).join(', ');
    clauses.push(
      `e.id IN (
        SELECT DISTINCT et.experience_id
        FROM   experience_tags et
        JOIN   department_tags dt ON dt.tag_id = et.tag_id
        WHERE  dt.department_id IN (${ph})
      )`
    );
    params.push(...deptIds);
  }

  if (tagIds.length) {
    const ph = tagIds.map((_, i) => `$${params.length + i + 1}`).join(', ');
    clauses.push(
      `e.id IN (
        SELECT DISTINCT et.experience_id
        FROM   experience_tags et
        WHERE  et.tag_id IN (${ph})
      )`
    );
    params.push(...tagIds);
  }

  return { whereClause: `(${clauses.join(' OR ')})`, params };
}

// ─── canAccessExperience ──────────────────────────────────────────────────────
async function canAccessExperience(userId, experienceId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM experiences e
     WHERE  e.id = $1
       AND (
         e.uploaded_by = $2
         OR EXISTS (
           SELECT 1 FROM experience_tags et
           JOIN   department_tags  dt ON dt.tag_id        = et.tag_id
           JOIN   user_departments ud ON ud.department_id = dt.department_id
           WHERE  et.experience_id = e.id AND ud.user_id = $2
         )
         OR EXISTS (
           SELECT 1 FROM experience_tags et
           JOIN   user_tags ut ON ut.tag_id = et.tag_id
           WHERE  et.experience_id = e.id AND ut.user_id = $2
         )
       )
     LIMIT 1`,
    [experienceId, userId]
  );
  return rows.length > 0;
}

module.exports = { getContentFilter, canAccessExperience };
