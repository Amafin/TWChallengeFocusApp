import db from './db.js';
import bcrypt from 'bcryptjs';

db.exec("DELETE FROM sessions; DELETE FROM users;");

const hash = bcrypt.hashSync('password123', 10);
const user = db.prepare("INSERT INTO users (email, password) VALUES ('demo@test.com', ?)").run(hash);
const userId = user.lastInsertRowid;

const stmt = db.prepare(`
  INSERT INTO sessions (userId, label, tags, plannedMinutes, startedAt, endedAt, status, distractionCount, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)
`);

for (let i = 14; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const time = d.toISOString();
  stmt.run(userId, `Session de code J-${i}`, JSON.stringify(['dev', 'focus']), 25, time, time, 1, time, time);
}

console.log('Données de seed injectées pour demo@test.com (MDP: password123)');