import assert from 'node:assert';
import db from './db.js';

// Test basique d'insertion session
const now = new Date().toISOString();
const info = db.prepare(`
  INSERT INTO sessions (userId, label, tags, plannedMinutes, startedAt, status, createdAt, updatedAt)
  VALUES (999, 'Test Label', '["test"]', 25, ?, 'active', ?, ?)
`).run(now, now, now);

const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(info.lastInsertRowid);
assert.strictEqual(row.label, 'Test Label');
assert.strictEqual(row.status, 'active');

// Nettoyage
db.prepare('DELETE FROM sessions WHERE id = ?').run(info.lastInsertRowid);
console.log('✅ Test unitaire réussi.');