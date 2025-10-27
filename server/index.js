import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { getDriverPoints } from './datasearch.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fso-naytto';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ars-admin';

const contentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  body: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});
const Content = mongoose.model('Content', contentSchema);

// leaderboard-malli kilpailutuloksille
const leaderboardSchema = new mongoose.Schema({
  category: { type: String, required: true, unique: true },
  sourceUrl: { type: String, default: '' },
  entries: [
    {
      name: { type: String, required: true },
      points: { type: Number, required: true }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
});
const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);

// Yhteys MongoDB:hen
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error', err));

const requireAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ error: 'token puuttuu' });
  }
  const token = auth.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'ei oikeuksia' });
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'virheellinen token' });
  }
};

// Login reitti
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'väärä käyttäjä tai salasana' });
});

// Sisällön hakua
app.get('/api/content/:key', async (req, res) => {
  const { key } = req.params;
  const doc = await Content.findOne({ key });
  if (!doc) return res.json({ key, body: '' });
  return res.json({ key: doc.key, body: doc.body, updatedAt: doc.updatedAt });
});

// Leaderboard-reitit
app.get('/api/leaderboard/:category', async (req, res) => {
  const { category } = req.params;
  const doc = await Leaderboard.findOne({ category });

  if (doc && doc.sourceUrl) {
    try {
      const entries = await getDriverPoints(doc.sourceUrl);
      // driver' -> 'name' 
      const formattedEntries = entries.map(e => ({ name: e.driver, points: e.points }));
      return res.json({ category: doc.category, entries: formattedEntries, sourceUrl: doc.sourceUrl, updatedAt: new Date() });
    } catch (error) {
      // debuggia
      console.error(`Datan haku epäonnistui osoitteesta ${doc.sourceUrl}:`, error.message);
      return res.json({ category, entries: [], sourceUrl: doc.sourceUrl, error: 'Pisteiden haku epäonnistui' });
    }
  }

  if (!doc) return res.json({ category, entries: [], sourceUrl: '' });
  return res.json({ category: doc.category, entries: doc.entries, sourceUrl: doc.sourceUrl, updatedAt: doc.updatedAt });
});

app.put('/api/leaderboard/:category', requireAdmin, async (req, res) => {
  const { category } = req.params;
  const { entries } = req.body || {};
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries pitää olla taulukko' });
  const sanitized = entries
    .filter(e => e && e.name && typeof e.points === 'number')
    .map(e => ({ name: e.name, points: e.points }));
  const updated = await Leaderboard.findOneAndUpdate(
    { category },
    { entries: sanitized, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  return res.json({ category: updated.category, entries: updated.entries, updatedAt: updated.updatedAt });
});

app.put('/api/leaderboard/:category/source', requireAdmin, async (req, res) => {
  const { category } = req.params;
  const { url } = req.body || {};

  if (typeof url !== 'string') {
    return res.status(400).json({ error: 'URL puuttuu tai on virheellinen' });
  }

  try {
    const updated = await Leaderboard.findOneAndUpdate(
      { category },
      { sourceUrl: url, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    return res.json({ category: updated.category, sourceUrl: updated.sourceUrl });
  } catch (e) {
    return res.status(500).json({ error: 'URL:n tallennus epäonnistui' });
  }
});

// Sisällön päivitys (vain adminille)
app.put('/api/content/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  const { body } = req.body || {};
  const updated = await Content.findOneAndUpdate(
    { key },
    { body: body || '', updatedAt: new Date() },
    { upsert: true, new: true }
  );
  return res.json({ key: updated.key, body: updated.body, updatedAt: updated.updatedAt });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});