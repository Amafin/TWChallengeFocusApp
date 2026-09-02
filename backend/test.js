import assert from 'node:assert';
import db from './db.js';

// 1. Créer un utilisateur de test
const userStmt = db.prepare(`
  INSERT INTO users (email, password)
  VALUES ('test@example.com', 'fakehash')
`);
const userRes = userStmt.run();
const testUserId = userRes.lastInsertRowid;

// 2. Insérer une session liée à cet utilisateur
const now = new Date().toISOString();
const sessionStmt = db.prepare(`
  INSERT INTO sessions (userId, label, tags, plannedMinutes, startedAt, status, createdAt, updatedAt)
  VALUES (?, 'Test Label', '["test"]', 25, ?, 'active', ?, ?)
`);
const sessionRes = sessionStmt.run(testUserId, now, now, now);

// 3. Vérifier les assertions
const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionRes.lastInsertRowid);
assert.strictEqual(row.label, 'Test Label');
assert.strictEqual(row.status, 'active');

// 4. Nettoyage
db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionRes.lastInsertRowid);
db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);

console.log('✅ Test unitaire réussi.');