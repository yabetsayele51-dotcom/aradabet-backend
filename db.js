// db.js
// Lightweight file-based SQLite DB — swap for Postgres/MySQL later if you outgrow it.
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "aradabet.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phone         TEXT UNIQUE NOT NULL,
    referral_code TEXT UNIQUE NOT NULL,
    invited_by    INTEGER,
    invite_count  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invited_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      TEXT UNIQUE NOT NULL,
    user_id       INTEGER NOT NULL,
    provider      TEXT NOT NULL,
    amount        REAL NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    provider_ref  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = db;
