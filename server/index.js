import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieSession from 'cookie-session';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { scoreAnswers } from './scoring.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret || cookieSecret.length < 32) {
  throw new Error('COOKIE_SECRET must be configured and contain at least 32 characters.');
}
if (!process.env.COMPETITION_CODE) {
  throw new Error('COMPETITION_CODE must be configured.');
}

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieSession({
  name: 'tea-session',
  keys: [cookieSecret],
  maxAge: 14 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });

function cleanString(value, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.display_name, role: user.role };
}

function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Please sign in to continue.' });
  const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(userId);
  if (!user) {
    req.session = null;
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
  next();
}

function listIngredients(dayId) {
  return db.prepare('SELECT id, position, name, is_present FROM ingredients WHERE tea_day_id = ? ORDER BY position').all(dayId);
}

function participantSubmission(dayId, userId) {
  const submission = db.prepare('SELECT id, submitted_at FROM submissions WHERE tea_day_id = ? AND user_id = ?').get(dayId, userId);
  if (!submission) return null;
  const answerRows = db.prepare('SELECT ingredient_id, choice FROM submission_answers WHERE submission_id = ?').all(submission.id);
  const answers = Object.fromEntries(answerRows.map((row) => [String(row.ingredient_id), row.choice]));
  return { submittedAt: submission.submitted_at, answers };
}

function leaderboardData() {
  const revealedDays = db.prepare(`SELECT id, day_number, title FROM tea_days WHERE status = 'REVEALED' ORDER BY day_number`).all();
  const users = db.prepare("SELECT id, display_name FROM users WHERE role = 'participant' ORDER BY display_name COLLATE NOCASE").all();
  const rows = users.map((user) => ({
    userId: user.id,
    displayName: user.display_name,
    total: 0,
    days: {},
  }));
  const byUser = new Map(rows.map((row) => [row.userId, row]));

  for (const day of revealedDays) {
    const ingredients = listIngredients(day.id);
    const submissions = db.prepare('SELECT id, user_id FROM submissions WHERE tea_day_id = ?').all(day.id);
    const submissionByUser = new Map(submissions.map((item) => [item.user_id, item.id]));
    for (const row of rows) {
      const submissionId = submissionByUser.get(row.userId);
      if (!submissionId) {
        row.days[day.id] = null;
        continue;
      }
      const answerRows = db.prepare('SELECT ingredient_id, choice FROM submission_answers WHERE submission_id = ?').all(submissionId);
      const answerMap = Object.fromEntries(answerRows.map((answer) => [String(answer.ingredient_id), answer.choice]));
      const scored = scoreAnswers(ingredients, answerMap);
      row.days[day.id] = scored.total;
      row.total += scored.total;
    }
  }
  rows.sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));
  return { days: revealedDays, participants: rows };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/me', (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(userId);
  if (!user) {
    req.session = null;
    return res.json({ user: null });
  }
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/register', registerLimiter, (req, res) => {
  const username = cleanString(req.body?.username, 32);
  const displayName = cleanString(req.body?.displayName, 32);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const competitionCode = typeof req.body?.competitionCode === 'string' ? req.body.competitionCode : '';

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–32 characters and use letters, numbers, dots, dashes, or underscores.' });
  }
  if (displayName.length < 2) return res.status(400).json({ error: 'Please choose a display name of at least 2 characters.' });
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Password must be between 8 and 100 characters.' });
  if (competitionCode !== process.env.COMPETITION_CODE) return res.status(403).json({ error: 'That competition invitation code is not correct.' });

  try {
    const passwordHash = bcrypt.hashSync(password, 12);
    const result = db.prepare(`INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'participant')`)
      .run(username, displayName, passwordHash);
    req.session.userId = Number(result.lastInsertRowid);
    const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(req.session.userId);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'That username is already taken.' });
    throw error;
  }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const username = cleanString(req.body?.username, 32);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Username or password is incorrect.' });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (_req, res) => {
  _req.session = null;
  res.json({ ok: true });
});

app.get('/api/days', requireAuth, (req, res) => {
  const days = db.prepare('SELECT id, day_number, title, tasting_date, status FROM tea_days ORDER BY day_number').all();
  const result = days.map((day) => {
    const ingredients = listIngredients(day.id).map((ingredient) => {
      const item = { id: ingredient.id, position: ingredient.position, name: ingredient.name };
      if (req.user.role === 'admin' || day.status === 'REVEALED') item.isPresent = Boolean(ingredient.is_present);
      return item;
    });
    return {
      ...day,
      ingredients,
      submission: req.user.role === 'participant' ? participantSubmission(day.id, req.user.id) : null,
    };
  });
  res.json({ days: result });
});

app.get('/api/leaderboard', requireAuth, (_req, res) => res.json(leaderboardData()));

app.post('/api/days/:dayId/submission', requireAuth, (req, res) => {
  if (req.user.role !== 'participant') return res.status(403).json({ error: 'Administrator accounts do not submit guesses.' });
  const dayId = Number(req.params.dayId);
  const day = db.prepare('SELECT id, status FROM tea_days WHERE id = ?').get(dayId);
  if (!day) return res.status(404).json({ error: 'That tea day does not exist.' });
  if (day.status !== 'OPEN') return res.status(409).json({ error: 'Submissions for this day are closed.' });

  const ingredients = listIngredients(dayId);
  if (ingredients.length !== 6) return res.status(409).json({ error: 'This day is not configured with six ingredients yet.' });
  const answers = req.body?.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return res.status(400).json({ error: 'Please provide one choice for each ingredient.' });
  const allowed = new Set(['IN', 'NOT_IN', 'NO_DECISION']);
  const expectedIds = new Set(ingredients.map((ingredient) => String(ingredient.id)));
  const submittedIds = Object.keys(answers);
  if (submittedIds.length !== 6 || submittedIds.some((id) => !expectedIds.has(id)) || ingredients.some((ingredient) => !allowed.has(answers[String(ingredient.id)]))) {
    return res.status(400).json({ error: 'Choose In, Not in, or No decision for all six ingredients.' });
  }

  const saveSubmission = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM submissions WHERE tea_day_id = ? AND user_id = ?').get(dayId, req.user.id);
    let submissionId;
    if (existing) {
      submissionId = existing.id;
      db.prepare('DELETE FROM submission_answers WHERE submission_id = ?').run(submissionId);
    } else {
      const result = db.prepare('INSERT INTO submissions (tea_day_id, user_id) VALUES (?, ?)').run(dayId, req.user.id);
      submissionId = Number(result.lastInsertRowid);
    }
    const insertAnswer = db.prepare('INSERT INTO submission_answers (submission_id, ingredient_id, choice) VALUES (?, ?, ?)');
    for (const ingredient of ingredients) insertAnswer.run(submissionId, ingredient.id, answers[String(ingredient.id)]);
    return submissionId;
  });
  saveSubmission();
  res.json({ ok: true, submission: participantSubmission(dayId, req.user.id) });
});

app.get('/api/admin/days', requireAuth, requireAdmin, (_req, res) => {
  const days = db.prepare('SELECT id, day_number, title, tasting_date, status FROM tea_days ORDER BY day_number').all();
  res.json({ days: days.map((day) => ({
    ...day,
    ingredients: listIngredients(day.id).map((ingredient) => ({ ...ingredient, isPresent: Boolean(ingredient.is_present) })),
    submissionCount: db.prepare('SELECT COUNT(*) AS count FROM submissions WHERE tea_day_id = ?').get(day.id).count,
  })) });
});

app.post('/api/admin/days', requireAuth, requireAdmin, (req, res) => {
  const dayNumber = Number(req.body?.dayNumber);
  const title = cleanString(req.body?.title, 80) || `Day ${dayNumber}`;
  const tastingDate = cleanString(req.body?.tastingDate, 10) || null;
  const ingredients = req.body?.ingredients;
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 366) return res.status(400).json({ error: 'Day number must be an integer from 1 to 366.' });
  if (tastingDate && !/^\d{4}-\d{2}-\d{2}$/.test(tastingDate)) return res.status(400).json({ error: 'Date must use YYYY-MM-DD format.' });
  if (!Array.isArray(ingredients) || ingredients.length !== 6) return res.status(400).json({ error: 'Enter exactly six ingredients for each day.' });
  const normalized = ingredients.map((item) => ({ name: cleanString(item?.name, 60), isPresent: item?.isPresent }));
  if (normalized.some((item) => item.name.length < 1 || typeof item.isPresent !== 'boolean')) {
    return res.status(400).json({ error: 'Each ingredient needs a name and a correct In/Not in answer.' });
  }

  try {
    const createDay = db.transaction(() => {
      const dayResult = db.prepare('INSERT INTO tea_days (day_number, title, tasting_date) VALUES (?, ?, ?)').run(dayNumber, title, tastingDate);
      const insertIngredient = db.prepare('INSERT INTO ingredients (tea_day_id, position, name, is_present) VALUES (?, ?, ?, ?)');
      normalized.forEach((item, index) => insertIngredient.run(Number(dayResult.lastInsertRowid), index + 1, item.name, item.isPresent ? 1 : 0));
      return Number(dayResult.lastInsertRowid);
    });
    const id = createDay();
    res.status(201).json({ ok: true, id });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'That day number already exists.' });
    throw error;
  }
});

app.post('/api/admin/days/:dayId/status', requireAuth, requireAdmin, (req, res) => {
  const dayId = Number(req.params.dayId);
  const target = req.body?.status;
  const day = db.prepare('SELECT id, status FROM tea_days WHERE id = ?').get(dayId);
  if (!day) return res.status(404).json({ error: 'That tea day does not exist.' });
  if (target === 'CLOSED' && day.status === 'OPEN') {
    db.prepare("UPDATE tea_days SET status = 'CLOSED' WHERE id = ?").run(dayId);
    return res.json({ ok: true, status: 'CLOSED' });
  }
  if (target === 'REVEALED' && day.status === 'CLOSED') {
    db.prepare("UPDATE tea_days SET status = 'REVEALED' WHERE id = ?").run(dayId);
    return res.json({ ok: true, status: 'REVEALED' });
  }
  res.status(409).json({ error: 'A day must move from Open to Closed, then from Closed to Revealed.' });
});

app.get('/api/admin/days/:dayId/submissions', requireAuth, requireAdmin, (req, res) => {
  const dayId = Number(req.params.dayId);
  const day = db.prepare('SELECT id, day_number, title, status FROM tea_days WHERE id = ?').get(dayId);
  if (!day) return res.status(404).json({ error: 'That tea day does not exist.' });
  const ingredients = listIngredients(dayId);
  const submissionRows = db.prepare(`
    SELECT s.id AS submission_id, s.submitted_at, u.display_name, u.id AS user_id
    FROM submissions s JOIN users u ON u.id = s.user_id
    WHERE s.tea_day_id = ? ORDER BY u.display_name COLLATE NOCASE
  `).all(dayId);
  const submissions = submissionRows.map((row) => {
    const answerRows = db.prepare('SELECT ingredient_id, choice FROM submission_answers WHERE submission_id = ?').all(row.submission_id);
    const answers = Object.fromEntries(answerRows.map((answer) => [String(answer.ingredient_id), answer.choice]));
    const score = scoreAnswers(ingredients, answers);
    return { userId: row.user_id, displayName: row.display_name, submittedAt: row.submitted_at, score: score.total, breakdown: score.breakdown };
  });
  res.json({ day, ingredients: ingredients.map((ingredient) => ({ ...ingredient, isPresent: Boolean(ingredient.is_present) })), submissions });
});

// Serve the production React build from the same origin as the API.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Tea Advent Competition running on port ${PORT}`);
});
