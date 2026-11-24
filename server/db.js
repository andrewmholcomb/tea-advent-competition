import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const configuredPath = process.env.DATABASE_PATH || './data/tea-competition.db';
const absolutePath = path.resolve(configuredPath);
fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

export const db = new Database(absolutePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tea_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_number INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    tasting_date TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'REVEALED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tea_day_id INTEGER NOT NULL REFERENCES tea_days(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    is_present INTEGER NOT NULL CHECK (is_present IN (0, 1)),
    UNIQUE (tea_day_id, position)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tea_day_id INTEGER NOT NULL REFERENCES tea_days(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tea_day_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS submission_answers (
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    choice TEXT NOT NULL CHECK (choice IN ('IN', 'NOT_IN', 'NO_DECISION')),
    PRIMARY KEY (submission_id, ingredient_id)
  );
`);

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminUsername && adminPassword) {
  const displayName = process.env.ADMIN_DISPLAY_NAME || 'Competition Host';
  const passwordHash = bcrypt.hashSync(adminPassword, 12);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (existing) {
    db.prepare(`UPDATE users SET display_name = ?, password_hash = ?, role = 'admin' WHERE id = ?`)
      .run(displayName, passwordHash, existing.id);
  } else {
    db.prepare(`INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')`)
      .run(adminUsername, displayName, passwordHash);
  }
} else {
  console.warn('ADMIN_USERNAME / ADMIN_PASSWORD not configured; create these environment variables to enable admin access.');
}
