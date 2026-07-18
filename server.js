require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { testConnection } = require('./config/database');
const { migrate }        = require('./config/migrate');
const { beritaRouter, usersRouter, jadwalRouter } = require('./routes/other');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS — izinkan Vercel frontend + localhost ─────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  'null', // file:// buka langsung di browser
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin tidak diizinkan — ' + origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('/*splat', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/jemaat', require('./routes/jemaat'));
app.use('/api/berita', beritaRouter);
app.use('/api/users',  usersRouter);
app.use('/api/jadwal', jadwalRouter);

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '⛪ Adullam Soul Connect API aktif',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({ message: '⛪ Adullam Soul Connect API — v2.0.0', docs: '/api/health' });
});

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} tidak ditemukan.` });
});

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────
async function start() {
  await testConnection();  // pastikan MySQL konek
  await migrate();         // buat tabel + seed jika belum ada
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ⛪ ══════════════════════════════════════ ⛪');
    console.log('       ADULLAM SOUL CONNECT — API v2.0.0');
    console.log('  ⛪ ══════════════════════════════════════ ⛪');
    console.log(`  🚀  http://localhost:${PORT}`);
    console.log(`  🗄️  MySQL: ${process.env.MYSQLHOST || 'localhost'}`);
    console.log('');
  });
}

start().catch(err => {
  console.error('Gagal start server:', err.message);
  process.exit(1);
});

module.exports = app;
