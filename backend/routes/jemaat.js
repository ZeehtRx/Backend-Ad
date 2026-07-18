const express = require('express');
const { pool } = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// GET /api/jemaat
router.get('/', async (req, res) => {
  const { status, search, pic_id, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = [], params = [];

  if (req.user.role === 'user') { where.push('j.pic_id = ?'); params.push(req.user.id); }
  else if (pic_id) { where.push('j.pic_id = ?'); params.push(pic_id); }
  if (status) { where.push('j.status = ?'); params.push(status); }
  if (search) { where.push('(j.nama LIKE ? OR j.telepon LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM jemaat j ${w}`, params);
    const [rows] = await pool.query(`
      SELECT j.*, u.nama AS pic_nama,
        (SELECT COUNT(*) FROM log_aktivitas la WHERE la.jemaat_id = j.id) AS total_log,
        (SELECT MAX(la2.created_at) FROM log_aktivitas la2 WHERE la2.jemaat_id = j.id) AS terakhir_kontak
      FROM jemaat j LEFT JOIN users u ON j.pic_id = u.id
      ${w} ORDER BY j.updated_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
    res.json({ success: true, data: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error: ' + e.message }); }
});

// GET /api/jemaat/stats/summary
router.get('/stats/summary', requireRole('admin'), async (req, res) => {
  try {
    const queries = [
      'SELECT COUNT(*) v FROM jemaat',
      "SELECT COUNT(*) v FROM jemaat WHERE status='Baru Datang'",
      "SELECT COUNT(*) v FROM jemaat WHERE status='Sudah Didekati'",
      "SELECT COUNT(*) v FROM jemaat WHERE status='Sudah Nongki'",
      "SELECT COUNT(*) v FROM jemaat WHERE status='Mulai Nyaman'",
      "SELECT COUNT(*) v FROM jemaat WHERE status='Masuk Grup WA'",
      "SELECT COUNT(*) v FROM jemaat WHERE status='Belum Connect'",
      "SELECT COUNT(*) v FROM jemaat WHERE tanggal_hadir >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)",
      `SELECT COUNT(*) v FROM jemaat WHERE id NOT IN (
        SELECT DISTINCT jemaat_id FROM log_aktivitas WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 DAY))`,
    ];
    const keys = ['total','baru','didekati','nongki','nyaman','grup_wa','belum','minggu_ini','terbengkalai'];
    const results = await Promise.all(queries.map(q => pool.query(q)));
    const data = {};
    keys.forEach((k, i) => { data[k] = results[i][0][0].v; });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error: ' + e.message }); }
});

// GET /api/jemaat/:id
router.get('/:id', async (req, res) => {
  try {
    const [[j]] = await pool.query(
      'SELECT j.*, u.nama AS pic_nama FROM jemaat j LEFT JOIN users u ON j.pic_id = u.id WHERE j.id = ?',
      [req.params.id]
    );
    if (!j) return res.status(404).json({ success: false, message: 'Jemaat tidak ditemukan.' });
    if (req.user.role === 'user' && j.pic_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    const [logs] = await pool.query(
      'SELECT la.*, u.nama AS user_nama FROM log_aktivitas la JOIN users u ON la.user_id = u.id WHERE la.jemaat_id = ? ORDER BY la.created_at DESC',
      [req.params.id]
    );
    res.json({ success: true, data: { ...j, log_aktivitas: logs } });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

// POST /api/jemaat
router.post('/', async (req, res) => {
  const { nama, telepon, tanggal_hadir, datang_via, catatan, pic_id } = req.body;
  if (!nama || !tanggal_hadir)
    return res.status(400).json({ success: false, message: 'Nama dan tanggal hadir wajib diisi.' });
  try {
    const pic = (req.user.role === 'admin' && pic_id) ? pic_id : req.user.id;
    const [r] = await pool.query(
      "INSERT INTO jemaat (nama,telepon,tanggal_hadir,datang_via,catatan,pic_id,status) VALUES (?,?,?,?,?,?,'Baru Datang')",
      [nama, telepon || null, tanggal_hadir, datang_via || 'Sendiri', catatan || null, pic]
    );
    await pool.query(
      "INSERT INTO log_aktivitas (jemaat_id,user_id,jenis,status_baru,catatan) VALUES (?,'?','Ibadah','Baru Datang','Jemaat baru pertama kali hadir')"
        .replace("'?'", '?'),
      [r.insertId, req.user.id]
    );
    res.status(201).json({ success: true, message: `${nama} berhasil ditambahkan!`, data: { id: r.insertId } });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error: ' + e.message }); }
});

// PUT /api/jemaat/:id
router.put('/:id', async (req, res) => {
  const { nama, telepon, datang_via, status, catatan, pic_id } = req.body;
  try {
    const [[j]] = await pool.query('SELECT * FROM jemaat WHERE id = ?', [req.params.id]);
    if (!j) return res.status(404).json({ success: false, message: 'Jemaat tidak ditemukan.' });
    if (req.user.role === 'user' && j.pic_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    const newPic = (req.user.role === 'admin' && pic_id) ? pic_id : j.pic_id;
    await pool.query(
      'UPDATE jemaat SET nama=?,telepon=?,datang_via=?,status=?,catatan=?,pic_id=? WHERE id=?',
      [nama||j.nama, telepon||j.telepon, datang_via||j.datang_via, status||j.status,
       catatan!==undefined?catatan:j.catatan, newPic, req.params.id]
    );
    res.json({ success: true, message: 'Data jemaat berhasil diupdate.' });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

// DELETE /api/jemaat/:id (admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM jemaat WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'Jemaat tidak ditemukan.' });
    res.json({ success: true, message: 'Jemaat berhasil dihapus.' });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

// POST /api/jemaat/:id/log
router.post('/:id/log', async (req, res) => {
  const { jenis, status_baru, catatan } = req.body;
  if (!jenis) return res.status(400).json({ success: false, message: 'Jenis kontak wajib diisi.' });
  try {
    const [[j]] = await pool.query('SELECT * FROM jemaat WHERE id = ?', [req.params.id]);
    if (!j) return res.status(404).json({ success: false, message: 'Jemaat tidak ditemukan.' });
    if (req.user.role === 'user' && j.pic_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    const [r] = await pool.query(
      'INSERT INTO log_aktivitas (jemaat_id,user_id,jenis,status_baru,catatan) VALUES (?,?,?,?,?)',
      [req.params.id, req.user.id, jenis, status_baru||null, catatan||null]
    );
    if (status_baru) await pool.query('UPDATE jemaat SET status=? WHERE id=?', [status_baru, req.params.id]);
    res.status(201).json({ success: true, message: 'Log berhasil disimpan.', data: { id: r.insertId } });
  } catch (e) { res.status(500).json({ success: false, message: 'Server error.' }); }
});

module.exports = router;
