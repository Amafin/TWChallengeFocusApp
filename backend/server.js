import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';

const app = express();
const JWT_SECRET = 'secret-focus-key';

app.use(express.json());
app.use(express.static('frontend'));

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// Auth
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
    const info = stmt.run(email.toLowerCase(), hash);
    const token = jwt.sign({ id: info.lastInsertRowid, email }, JWT_SECRET);
    res.json({ token });
  } catch {
    res.status(400).json({ error: 'Email déjà utilisé' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
  res.json({ token });
});

// Sessions CRUD
app.get('/api/sessions', auth, (req, res) => {
  const { search = '', tag = '', limit = 10, offset = 0 } = req.query;
  const query = `
    SELECT * FROM sessions 
    WHERE userId = ? 
      AND LOWER(label) LIKE ? 
      AND (? = '' OR tags LIKE ?)
    ORDER BY startedAt DESC 
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(query).all(
    req.user.id,
    `%${search.toLowerCase()}%`,
    tag,
    `%${tag}%`,
    Number(limit),
    Number(offset)
  );

  res.json(rows.map(s => ({ ...s, tags: JSON.parse(s.tags) })));
});

app.post('/api/sessions', auth, (req, res) => {
  const { label, tags = [], plannedMinutes } = req.body;
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO sessions (userId, label, tags, plannedMinutes, startedAt, status, distractionCount, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)
  `);
  const info = stmt.run(req.user.id, label, JSON.stringify(tags), plannedMinutes, now, now, now);
  res.json({ id: info.lastInsertRowid, status: 'active', startedAt: now, plannedMinutes });
});

app.patch('/api/sessions/:id', auth, (req, res) => {
  const { status, distractionIncrement } = req.body;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });

  const now = new Date().toISOString();
  let distractionCount = session.distractionCount + (distractionIncrement || 0);
  let newStatus = status || session.status;
  let endedAt = (newStatus === 'completed' || newStatus === 'abandoned') ? now : session.endedAt;

  db.prepare(`
    UPDATE sessions 
    SET status = ?, distractionCount = ?, endedAt = ?, updatedAt = ? 
    WHERE id = ?
  `).run(newStatus, distractionCount, endedAt, now, session.id);

  res.json({ success: true, status: newStatus, distractionCount, endedAt });
});

// Stats & Tags
app.get('/api/stats', auth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  // Minutes totales aujourd'hui
  const todaySessions = db.prepare(`
    SELECT plannedMinutes, startedAt, endedAt, status 
    FROM sessions 
    WHERE userId = ? AND startedAt LIKE ? AND status = 'completed'
  `).all(req.user.id, `${today}%`);

  const todayMinutes = todaySessions.reduce((acc, s) => acc + s.plannedMinutes, 0);

  // Calcul du streak
  const activeDays = db.prepare(`
    SELECT DISTINCT substr(startedAt, 1, 10) as day 
    FROM sessions 
    WHERE userId = ? AND status = 'completed' 
    ORDER BY day DESC
  `).all(req.user.id).map(r => r.day);

  let streak = 0;
  let checkDate = new Date();
  
  // Vérifie si la série inclut aujourd'hui ou hier
  let dateStr = checkDate.toISOString().split('T')[0];
  if (!activeDays.includes(dateStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
    dateStr = checkDate.toISOString().split('T')[0];
  }

  while (activeDays.includes(dateStr)) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
    dateStr = checkDate.toISOString().split('T')[0];
  }

  res.json({ todayMinutes, streak });
});

app.listen(3000, () => console.log('Serveur démarré: http://localhost:3000'));