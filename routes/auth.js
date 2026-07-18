const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const router  = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { telepon, password } = req.body;
  if (!telepon || !password)
    return res.status(400).json({ success: false, message: 'Telepon dan password wajib diisi.' });
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE telepon = ? AND aktif = 1', [telepon]);
    const user = rows[0];
    if (!user) return res.status(401).json({ success: false, message: 'Nomor telepon tidak terdaftar.' });
    if (!bcrypt.compareSync(password, user.password))
      return res.status(401).json({ success: false, message: 'Password salah.' });

    const payload = { id: user.id, nama: user.nama, telepon: user.telepon, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({ success: true, message: `Selamat datang, ${user.nama}!`, token, user: payload });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error: ' + e.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { nama, telepon, password } = req.body;
  if (!nama || !telepon || !password)
    return res.status(400).json({ success: false, message: 'Nama, telepon, dan password wajib diisi.' });
  if (password.length < 6)
    return res.status(400).json({ success: false, message: 'Password minimal 6 karakter.' });
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE telepon = ?', [telepon]);
    if (existing.length > 0)
      return res.status(409).json({ success: false, message: 'Nomor telepon sudah terdaftar.' });

    const hash = bcrypt.hashSync(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (nama, telepon, password, role) VALUES (?, ?, ?, ?)',
      [nama, telepon, hash, 'jemaat']
    );
    const payload = { id: result.insertId, nama, telepon, role: 'jemaat' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.status(201).json({ success: true, message: 'Akun berhasil dibuat!', token, user: payload });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error: ' + e.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nama, telepon, role, created_at FROM users WHERE id = ?', [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    res.json({ success: true, user: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  const { password_lama, password_baru } = req.body;
  if (!password_lama || !password_baru)
    return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi.' });
  try {
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(password_lama, rows[0].password))
      return res.status(401).json({ success: false, message: 'Password lama salah.' });
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(password_baru, 10), req.user.id]);
    res.json({ success: true, message: 'Password berhasil diubah.' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
