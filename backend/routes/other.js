// ── BERITA ────────────────────────────────────────────────────
const express = require('express');
const bcrypt  = require('bcryptjs');
const { pool } = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/auth');

// ── berita.js ──────────────────────────────────────────────
const beritaRouter = express.Router();
beritaRouter.use(authMiddleware);

beritaRouter.get('/', async (req, res) => {
  const { kategori, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = [], params = [];
  if (kategori) { where.push('b.kategori = ?'); params.push(kategori); }
  if (search)   { where.push('(b.judul LIKE ? OR b.isi LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM berita b ${w}`, params);
    const [rows] = await pool.query(`
      SELECT b.*, u.nama AS penulis_nama FROM berita b LEFT JOIN users u ON b.penulis_id = u.id
      ${w} ORDER BY b.pinned DESC, b.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, data: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

beritaRouter.get('/:id', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT b.*,u.nama penulis_nama FROM berita b LEFT JOIN users u ON b.penulis_id=u.id WHERE b.id=?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Berita tidak ditemukan.' });
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

beritaRouter.post('/', requireRole('admin'), async (req, res) => {
  const { judul, isi, kategori, pinned } = req.body;
  if (!judul || !isi) return res.status(400).json({ success: false, message: 'Judul dan isi wajib diisi.' });
  try {
    const [r] = await pool.query('INSERT INTO berita (judul,isi,kategori,pinned,penulis_id) VALUES (?,?,?,?,?)',
      [judul, isi, kategori || 'pengumuman', pinned ? 1 : 0, req.user.id]);
    res.status(201).json({ success: true, message: 'Berita berhasil dipublish!', data: { id: r.insertId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

beritaRouter.put('/:id', requireRole('admin'), async (req, res) => {
  const { judul, isi, kategori, pinned } = req.body;
  try {
    const [r] = await pool.query(
      'UPDATE berita SET judul=COALESCE(?,judul),isi=COALESCE(?,isi),kategori=COALESCE(?,kategori),pinned=COALESCE(?,pinned) WHERE id=?',
      [judul||null, isi||null, kategori||null, pinned!==undefined?(pinned?1:0):null, req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'Berita tidak ditemukan.' });
    res.json({ success: true, message: 'Berita diupdate.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

beritaRouter.patch('/:id/pin', requireRole('admin'), async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT pinned FROM berita WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Berita tidak ditemukan.' });
    const np = row.pinned ? 0 : 1;
    await pool.query('UPDATE berita SET pinned=? WHERE id=?', [np, req.params.id]);
    res.json({ success: true, message: np ? 'Berita disematkan.' : 'Pin dilepas.', pinned: np });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

beritaRouter.patch('/:id/like', async (req, res) => {
  try {
    const [r] = await pool.query('UPDATE berita SET likes=likes+1 WHERE id=?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'Berita tidak ditemukan.' });
    const [[row]] = await pool.query('SELECT likes FROM berita WHERE id=?', [req.params.id]);
    res.json({ success: true, likes: row.likes });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

beritaRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM berita WHERE id=?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'Berita tidak ditemukan.' });
    res.json({ success: true, message: 'Berita dihapus.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── users.js ──────────────────────────────────────────────
const usersRouter = express.Router();
usersRouter.use(authMiddleware, requireRole('admin'));

usersRouter.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT u.id,u.nama,u.telepon,u.role,u.aktif,u.created_at,COUNT(j.id) total_jemaat FROM users u LEFT JOIN jemaat j ON j.pic_id=u.id GROUP BY u.id ORDER BY u.role,u.nama');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

usersRouter.get('/caring-team/list', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT u.id,u.nama,u.telepon,COUNT(j.id) beban FROM users u LEFT JOIN jemaat j ON j.pic_id=u.id WHERE u.role='user' AND u.aktif=1 GROUP BY u.id ORDER BY beban ASC");
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

usersRouter.post('/', async (req, res) => {
  const { nama, telepon, password, role } = req.body;
  if (!nama||!telepon||!password) return res.status(400).json({ success: false, message: 'Nama, telepon, password wajib.' });
  try {
    const [[ex]] = await pool.query('SELECT id FROM users WHERE telepon=?', [telepon]);
    if (ex) return res.status(409).json({ success: false, message: 'Telepon sudah terdaftar.' });
    const [r] = await pool.query('INSERT INTO users (nama,telepon,password,role) VALUES (?,?,?,?)',
      [nama, telepon, bcrypt.hashSync(password, 10), role || 'user']);
    res.status(201).json({ success: true, message: `User ${nama} ditambahkan.`, data: { id: r.insertId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

usersRouter.put('/:id', async (req, res) => {
  const { nama, telepon, role, aktif, password } = req.body;
  try {
    const [[u]] = await pool.query('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!u) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    const hash = password ? bcrypt.hashSync(password, 10) : u.password;
    await pool.query('UPDATE users SET nama=?,telepon=?,role=?,aktif=?,password=? WHERE id=?',
      [nama||u.nama, telepon||u.telepon, role||u.role, aktif!==undefined?aktif:u.aktif, hash, req.params.id]);
    res.json({ success: true, message: 'User diupdate.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

usersRouter.delete('/:id', async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ success: false, message: 'Tidak bisa menghapus akun sendiri.' });
  try {
    const [r] = await pool.query('UPDATE users SET aktif=0 WHERE id=?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    res.json({ success: true, message: 'User dinonaktifkan.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── jadwal.js ─────────────────────────────────────────────
const jadwalRouter = express.Router();
jadwalRouter.use(authMiddleware);

jadwalRouter.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM jadwal ORDER BY urutan ASC, id ASC');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

jadwalRouter.post('/', requireRole('admin'), async (req, res) => {
  const { nama, hari, jam, ikon, aktif, urutan } = req.body;
  if (!nama||!hari||!jam) return res.status(400).json({ success: false, message: 'Nama, hari, jam wajib.' });
  try {
    const [r] = await pool.query('INSERT INTO jadwal (nama,hari,jam,ikon,aktif,urutan) VALUES (?,?,?,?,?,?)',
      [nama, hari, jam, ikon||'⛪', aktif!==undefined?aktif:1, urutan||0]);
    res.status(201).json({ success: true, message: 'Jadwal ditambahkan.', data: { id: r.insertId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

jadwalRouter.put('/:id', requireRole('admin'), async (req, res) => {
  const { nama, hari, jam, ikon, aktif, urutan } = req.body;
  try {
    const [r] = await pool.query('UPDATE jadwal SET nama=COALESCE(?,nama),hari=COALESCE(?,hari),jam=COALESCE(?,jam),ikon=COALESCE(?,ikon),aktif=COALESCE(?,aktif),urutan=COALESCE(?,urutan) WHERE id=?',
      [nama||null,hari||null,jam||null,ikon||null,aktif!==undefined?aktif:null,urutan!==undefined?urutan:null,req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan.' });
    res.json({ success: true, message: 'Jadwal diupdate.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

jadwalRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM jadwal WHERE id=?', [req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan.' });
    res.json({ success: true, message: 'Jadwal dihapus.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = { beritaRouter, usersRouter, jadwalRouter };
