/**
 * Wrapper de banco de dados — usa better-sqlite3 (gravação direta em disco).
 * No Railway, configure um Volume em /app/data para persistir entre deploys.
 *
 * API compatível com o wrapper anterior (sql.js).
 */

const fs   = require('fs');
const path = require('path');

let _db = null;

async function initSqlJs(dbPath) {
  if (_db) return;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const BSqlite = require('better-sqlite3');
  _db = new BSqlite(dbPath);

  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous  = NORMAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('cache_size   = 10000');

  console.log(`[DB] better-sqlite3 conectado: ${dbPath}`);
}

// ─── API pública ──────────────────────────────────────────────────────────────

const db = {
  pragma(stmt) {
    try { _db.pragma(stmt); } catch {}
  },

  exec(sql) {
    try { _db.exec(sql); } catch (e) {
      if (!e.message?.includes('already exists')) throw e;
    }
  },

  prepare(sql) {
    return {
      run(...params) {
        try {
          const info = _db.prepare(sql).run(...params.flat());
          return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
        } catch (e) {
          if (e.message?.includes('already exists')) return { changes: 0 };
          throw e;
        }
      },
      get(...params) {
        try { return _db.prepare(sql).get(...params.flat()); } catch { return undefined; }
      },
      all(...params) {
        try { return _db.prepare(sql).all(...params.flat()); } catch { return []; }
      },
    };
  },

  transaction(fn) {
    return function(...args) {
      return _db.transaction(fn)(...args);
    };
  },

  // better-sqlite3 persiste em disco automaticamente — save() é no-op
  save() {},
};

module.exports = { initSqlJs, db };
