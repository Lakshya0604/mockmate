import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { User, Interview } from './models.js';
import { generateQuestions, evaluateAnswer, summarizeInterview, llmConfigured } from './llm.js';
import { clampScore, overallScore, verdict, wordCount } from './scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { MONGODB_URI, JWT_SECRET } = process.env;
if (!MONGODB_URI || !JWT_SECRET) { console.error('MONGODB_URI and JWT_SECRET must be set'); process.exit(1); }

const LEVELS = ['Intern', 'Fresher', 'Junior', 'Mid-level', 'Senior'];
const FOCUS = ['Technical', 'Behavioral', 'Mixed'];
const QUESTION_COUNT = 5;

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50kb' }));

const mk = (windowMs, limit, message, keyGenerator) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message }, ...(keyGenerator ? { keyGenerator } : {}) });
const authLimiter = mk(15 * 60 * 1000, 30, 'Too many attempts. Try again in a few minutes.');
const userKey = (req) => req.userId || req.ip;
const startLimiter = mk(24 * 60 * 60 * 1000, 10, 'Daily limit reached (10 interviews). Come back tomorrow.', userKey);
const answerLimiter = mk(60 * 60 * 1000, 60, 'Hourly answer limit reached. Please try again later.', userKey);

const sign = (u) => jwt.sign({ id: u._id.toString() }, JWT_SECRET, { expiresIn: '14d' });
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in.' });
  try { req.userId = jwt.verify(token, JWT_SECRET).id; next(); } catch { res.status(401).json({ error: 'Session expired. Please log in again.' }); }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1, ai: llmConfigured() }));

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  const { name = '', email = '', password = '' } = req.body || {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    if (await User.findOne({ email: email.toLowerCase().trim() })) return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = await User.create({ name: String(name).slice(0, 80), email, passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not create account.' }); }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  res.json({ user: publicUser(user) });
});

// The sample answers are hidden until a question has been answered.
const view = (doc) => {
  const o = doc.toObject();
  o.questions = o.questions.map((q, i) => (i > doc.current ? { topic: q.topic, hidden: true } : q.answer !== undefined ? q : { question: q.question, topic: q.topic }));
  return o;
};

app.post('/api/interviews', auth, startLimiter, async (req, res) => {
  const role = String(req.body?.role || '').trim().slice(0, 100);
  const level = LEVELS.includes(req.body?.level) ? req.body.level : 'Fresher';
  const focus = FOCUS.includes(req.body?.focus) ? req.body.focus : 'Mixed';
  if (role.length < 3) return res.status(400).json({ error: 'Enter the role you are interviewing for (for example "Frontend Developer").' });
  if (!llmConfigured()) return res.status(503).json({ error: 'AI is not configured on the server.' });
  try {
    const qs = await generateQuestions({ role, level, focus, count: QUESTION_COUNT });
    const doc = await Interview.create({ user: req.userId, role, level, focus, questions: qs });
    res.status(201).json(view(doc));
  } catch (e) { console.error('generate failed:', e.message); res.status(502).json({ error: 'The AI service failed. Please try again in a minute.' }); }
});

app.get('/api/interviews', auth, async (req, res) => {
  const items = await Interview.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50).select('role level focus status overall verdict current createdAt');
  res.json(items);
});

app.get('/api/interviews/:id', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const doc = await Interview.findOne({ _id: req.params.id, user: req.userId });
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  res.json(doc.status === 'completed' ? doc : view(doc));
});

app.post('/api/interviews/:id/answer', auth, answerLimiter, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const answer = String(req.body?.answer || '').trim();
  if (wordCount(answer) < 5) return res.status(400).json({ error: 'Write at least a few words for your answer.' });
  if (answer.length > 3000) return res.status(400).json({ error: 'Answer is too long (max 3,000 characters).' });
  const doc = await Interview.findOne({ _id: req.params.id, user: req.userId });
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  if (doc.status === 'completed') return res.status(409).json({ error: 'This interview is already finished.' });
  const idx = doc.current;
  const q = doc.questions[idx];
  if (q.answer !== undefined && q.answer !== null) return res.status(409).json({ error: 'This question was already answered.' });
  try {
    const ev = await evaluateAnswer({ role: doc.role, level: doc.level, question: q.question, answer });
    Object.assign(q, { answer, score: clampScore(ev.score), feedback: ev.feedback, strengths: ev.strengths, improvements: ev.improvements, betterAnswer: ev.better_answer, answeredAt: new Date() });
    const last = idx === doc.questions.length - 1;
    if (last) {
      const items = doc.questions.map((x) => ({ question: x.question, answer: x.answer, score: x.score }));
      let report = { summary: '', strengths: [], weaknesses: [], next_steps: [] };
      try { report = await summarizeInterview({ role: doc.role, level: doc.level, items }); } catch (e) { console.error('summary failed:', e.message); }
      doc.report = report;
      doc.overall = overallScore(doc.questions);
      doc.verdict = verdict(doc.overall);
      doc.status = 'completed';
    } else {
      doc.current = idx + 1;
    }
    doc.markModified('questions');
    await doc.save();
    res.json(doc.status === 'completed' ? doc : view(doc));
  } catch (e) { console.error('evaluate failed:', e.message); res.status(502).json({ error: 'The AI service failed. Your answer was not lost - press Submit again.' }); }
});

app.delete('/api/interviews/:id', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  await Interview.deleteOne({ _id: req.params.id, user: req.userId });
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = process.env.PORT || 3000;
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => app.listen(port, () => console.log(`MockMate listening on ${port}`)))
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
