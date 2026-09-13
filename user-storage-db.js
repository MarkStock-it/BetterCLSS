/**
 * user-storage-db.js
 *
 * MariaDB durable persistence for BetterCLSS user data.
 *
 * Architecture (chosen to fit the existing synchronous storage API):
 * - The file store (user-storage.js) remains the synchronous working set used
 *   by all existing callers — no risky refactor of ~15 call sites.
 * - This module makes MariaDB the durable source of truth:
 *     1. `restoreAllFromDb()` at server startup copies every stored user
 *        document back into the working file store (so ephemeral disks /
 *        redeploys never lose data).
 *     2. Every save in user-storage.js is mirrored here, keyed by the
 *        SHA-256 of "<domain>\n<canvasUserId>" (see user-identity.js).
 * - Raw Canvas user IDs are never database keys; Canvas tokens are never
 *   stored anywhere. DB credentials come from environment variables only.
 */

const fs = require('fs');
const path = require('path');
const { hashUserId } = require('./user-identity');

const DATA_DIR = path.join(__dirname, '.betterclss_data');

let poolPromise = null;
let schemaReady = false;

function isDbConfigured() {
  return Boolean(
    process.env.DB_HOST
    && process.env.DB_USER
    && process.env.DB_NAME
    && process.env.DB_PASSWORD !== undefined
  );
}

function getPool() {
  if (!isDbConfigured()) return null;
  if (!poolPromise) {
    try {
      const mysql = require('mysql2/promise');
      poolPromise = mysql.createPool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 5,
      });
    } catch (err) {
      console.error('[user-storage-db] pool creation failed:', err.message);
      poolPromise = null;
    }
  }
  return poolPromise;
}

async function ensureSchema(pool) {
  if (schemaReady) return true;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            CHAR(64)     PRIMARY KEY,
        canvas_domain VARCHAR(255) NOT NULL DEFAULT 'usc.instructure.com',
        name          VARCHAR(255) NOT NULL DEFAULT '',
        email         VARCHAR(255) NOT NULL DEFAULT '',
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_data (
        user_id    CHAR(64)  PRIMARY KEY,
        data       JSON      NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_user_data_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_activity (
        id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id    CHAR(64)  NOT NULL,
        kind       VARCHAR(64) NOT NULL,
        detail     JSON      NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_activity_user (user_id, created_at),
        CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    schemaReady = true;
    return true;
  } catch (err) {
    console.error('[user-storage-db] schema setup failed:', err.message);
    return false;
  }
}

function fileSafeName(canvasUserId) {
  // Working-set file name: hashed, never the raw Canvas user ID.
  return `user_${hashUserId('local', canvasUserId).slice(0, 32)}.json`;
}

function getFilePathForWorkingSet(canvasUserId) {
  return path.join(DATA_DIR, fileSafeName(canvasUserId));
}

function getFileNameForWorkingSet(canvasUserId) {
  return fileSafeName(canvasUserId);
}

/**
 * Restore every durable user document from MariaDB into the file store.
 * Called once at server startup. Missing DB config is not an error
 * (local dev keeps file-only mode).
 */
async function restoreAllFromDb() {
  if (!isDbConfigured()) {
    console.log('[user-storage-db] DB not configured — file-only mode');
    return 0;
  }
  const pool = getPool();
  if (!pool || !(await ensureSchema(pool))) return 0;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const [rows] = await pool.query(
      'SELECT user_id, canvas_domain, data, JSON_EXTRACT(data, "$.__canvasUserId") AS raw_id FROM user_data'
    );
    let restored = 0;
    for (const row of rows) {
      const rawId = row.raw_id;
      if (rawId === null || rawId === undefined) continue;
      const filePath = getFilePathForWorkingSet(rawId);
      if (!fs.existsSync(filePath)) {
        const doc = { ...row.data };
        fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf8');
        restored += 1;
      }
    }
    console.log(`[user-storage-db] restored ${restored} user record(s) from MariaDB (${rows.length} total)`);
    return restored;
  } catch (err) {
    console.error('[user-storage-db] restore failed:', err.message);
    return 0;
  }
}

/**
 * Mirror a save to MariaDB, keyed by hashed identity.
 * Fire-and-forget from the caller's perspective (errors logged, never thrown).
 */
async function persistUser(canvasUserId, userData, domain = 'usc.instructure.com') {
  if (!isDbConfigured()) return;
  const internalId = hashUserId(domain, canvasUserId);
  const pool = getPool();
  if (!pool || !(await ensureSchema(pool))) return;
  try {
    const doc = { ...userData };
    delete doc.userId; // never persist the raw Canvas user id
    doc.internalId = internalId;
    // Working-set key needed at restore; stored inside the JSON document,
    // never as a column/key.
    doc.__canvasUserId = String(canvasUserId);
    const name = doc.name || '';
    const email = doc.email || '';
    await pool.query(
      'INSERT INTO users (id, canvas_domain, name, email) VALUES (?, ?, ?, ?) '
      + 'ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)',
      [internalId, domain, name, email]
    );
    await pool.query(
      'INSERT INTO user_data (user_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [internalId, JSON.stringify(doc)]
    );
  } catch (err) {
    console.error('[user-storage-db] persist failed:', err.message);
  }
}

/**
 * Record a user activity/history entry (append-only).
 */
async function recordActivity(canvasUserId, kind, detail = null, domain = 'usc.instructure.com') {
  if (!isDbConfigured()) return;
  const internalId = hashUserId(domain, canvasUserId);
  const pool = getPool();
  if (!pool || !(await ensureSchema(pool))) return;
  try {
    await pool.query(
      'INSERT INTO users (id, canvas_domain) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id',
      [internalId, domain]
    );
    await pool.query(
      'INSERT INTO user_activity (user_id, kind, detail) VALUES (?, ?, ?)',
      [internalId, String(kind).slice(0, 64), detail ? JSON.stringify(detail) : null]
    );
  } catch (err) {
    console.error('[user-storage-db] recordActivity failed:', err.message);
  }
}

/**
 * List recent activity entries for a user (most recent first, capped).
 */
async function listActivity(canvasUserId, limit = 50, domain = 'usc.instructure.com') {
  if (!isDbConfigured()) return [];
  const internalId = hashUserId(domain, canvasUserId);
  const pool = getPool();
  if (!pool || !(await ensureSchema(pool))) return [];
  const [rows] = await pool.query(
    'SELECT kind, detail, created_at FROM user_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [internalId, Number(limit) || 50]
  );
  return rows.map((row) => ({
    kind: row.kind,
    detail: typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail,
    at: row.created_at,
  }));
}

module.exports = {
  isDbConfigured,
  restoreAllFromDb,
  persistUser,
  recordActivity,
  listActivity,
  getFilePathForWorkingSet,
  getFileNameForWorkingSet,
  _internal: { hashUserId, ensureSchema },
};
