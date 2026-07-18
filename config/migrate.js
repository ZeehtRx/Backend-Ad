const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log('🔧 Menjalankan migrasi database...');

    // ── USERS ──────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        nama       VARCHAR(100) NOT NULL,
        telepon    VARCHAR(20)  NOT NULL UNIQUE,
        password   VARCHAR(255) NOT NULL,
        role       ENUM('admin','user','jemaat') NOT NULL DEFAULT 'jemaat',
        aktif      TINYINT(1)   NOT NULL DEFAULT 1,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── JEMAAT ─────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS jemaat (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        nama          VARCHAR(100) NOT NULL,
        telepon       VARCHAR(20),
        tanggal_hadir DATE         NOT NULL,
        datang_via    ENUM('Sendiri','Diajak teman','Media sosial','Lainnya') DEFAULT 'Sendiri',
        status        ENUM('Baru Datang','Sudah Didekati','Sudah Nongki','Mulai Nyaman','Masuk Grup WA','Belum Connect')
                      NOT NULL DEFAULT 'Baru Datang',
        pic_id        INT          REFERENCES users(id) ON DELETE SET NULL,
        catatan       TEXT,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_pic_id (pic_id),
        INDEX idx_tanggal (tanggal_hadir)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── LOG AKTIVITAS ──────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS log_aktivitas (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        jemaat_id   INT NOT NULL,
        user_id     INT NOT NULL,
        jenis       ENUM('WhatsApp','Telepon','Tatap Muka','Grup WA','Ibadah','Lainnya') NOT NULL,
        status_baru ENUM('Baru Datang','Sudah Didekati','Sudah Nongki','Mulai Nyaman','Masuk Grup WA','Belum Connect'),
        catatan     TEXT,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (jemaat_id) REFERENCES jemaat(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id)   REFERENCES users(id)  ON DELETE CASCADE,
        INDEX idx_jemaat (jemaat_id),
        INDEX idx_user   (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── BERITA ─────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS berita (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        judul      VARCHAR(255) NOT NULL,
        isi        TEXT         NOT NULL,
        kategori   ENUM('ibadah','pengumuman','renungan','acara','doa') NOT NULL DEFAULT 'pengumuman',
        pinned     TINYINT(1)   NOT NULL DEFAULT 0,
        penulis_id INT          NOT NULL,
        likes      INT          NOT NULL DEFAULT 0,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (penulis_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_kategori (kategori),
        INDEX idx_pinned   (pinned)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── JADWAL ─────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS jadwal (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        nama       VARCHAR(100) NOT NULL,
        hari       VARCHAR(20)  NOT NULL,
        jam        VARCHAR(20)  NOT NULL,
        ikon       VARCHAR(10)  DEFAULT '⛪',
        aktif      TINYINT(1)   NOT NULL DEFAULT 1,
        urutan     INT          NOT NULL DEFAULT 0,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Semua tabel berhasil dibuat!');

    // ── SEED DATA (hanya jika tabel users kosong) ──────────
    const [rows] = await conn.query('SELECT COUNT(*) as cnt FROM users');
    if (rows[0].cnt > 0) {
      console.log('ℹ️  Data sudah ada, skip seeding.');
      return;
    }

    console.log('🌱 Seeding data awal...');

    const adminHash  = bcrypt.hashSync('admin123',  10);
    const userHash   = bcrypt.hashSync('user123',   10);
    const jemaatHash = bcrypt.hashSync('jemaat123', 10);

    await conn.query(`
      INSERT INTO users (nama, telepon, password, role) VALUES
        ('Administrator',    '08000000000', ?, 'admin'),
        ('Maria Simanullang','08111111111', ?, 'user'),
        ('Yusuf Tambunan',   '08122334455', ?, 'user'),
        ('Rina Kusuma',      '08222222222', ?, 'jemaat')
    `, [adminHash, userHash, userHash, jemaatHash]);

    await conn.query(`
      INSERT INTO jemaat (nama, telepon, tanggal_hadir, datang_via, status, pic_id, catatan) VALUES
        ('Andi Saputra', '0812 3456 7890', '2025-05-15', 'Sendiri',       'Baru Datang',   2, 'Ramah, datang sendiri'),
        ('Sari Dewi',    '0813 9876 5432', '2025-05-12', 'Diajak teman',  'Sudah Didekati',3, 'Diajak teman'),
        ('Michael Tan',  '0811 2233 4455', '2025-05-08', 'Sendiri',       'Sudah Nongki',  2, 'Beberapa kali hadir'),
        ('Budi Santoso', '0819 1122 3344', '2025-05-01', 'Media sosial',  'Mulai Nyaman',  3, 'Aktif di grup WA'),
        ('Dewi Lestari', '0815 5544 3322', '2025-04-28', 'Sendiri',       'Belum Connect', 2, 'Belum bisa dihubungi'),
        ('Ahmad Fauzi',  '0821 7788 9900', '2025-04-20', 'Diajak teman',  'Masuk Grup WA', 3, 'Sudah di grup'),
        ('Citra Nilam',  '0817 6655 4433', '2025-04-14', 'Sendiri',       'Baru Datang',   2, 'Pertama kali hadir'),
        ('Rizky Pratama','0816 3344 5566', '2025-04-10', 'Media sosial',  'Sudah Didekati',3, 'Dari Instagram')
    `);

    await conn.query(`
      INSERT INTO log_aktivitas (jemaat_id, user_id, jenis, status_baru, catatan) VALUES
        (1, 2, 'WhatsApp',  'Sudah Didekati', 'Perkenalan awal, respons positif'),
        (2, 3, 'Tatap Muka','Sudah Didekati', 'Duduk dekat saat ibadah'),
        (3, 2, 'Grup WA',   'Sudah Nongki',   'Invite ke grup, diterima'),
        (4, 3, 'WhatsApp',  'Mulai Nyaman',   'Follow up, respons positif'),
        (6, 3, 'WhatsApp',  'Masuk Grup WA',  'Sudah aktif di grup')
    `);

    await conn.query(`
      INSERT INTO berita (judul, isi, kategori, pinned, penulis_id) VALUES
        ('Ibadah Raya — "Hidup yang Berkelimpahan"',
         'Shalom Jemaat!\n\nKami mengundang seluruh jemaat untuk Ibadah Raya Minggu.\nTema: "Hidup yang Berkelimpahan" — Yohanes 10:10.\nMulai pukul 09.00 WIB.',
         'ibadah', 1, 1),
        ('Renungan: Percayakan Jalanmu kepada Tuhan',
         '"Percayakanlah hidupmu kepada TUHAN dan Ia akan bertindak." — Mazmur 37:5\n\nMari isi hari ini dengan doa dan kepercayaan penuh.',
         'renungan', 0, 1),
        ('Pendaftaran Sel Group — Juli 2025',
         'Sel Group Juli 2025 dibuka!\nDaftar ke koordinator atau WA: 0812-0000-0000. Kuota terbatas!',
         'pengumuman', 0, 1),
        ('Youth Night — Sabtu 28 Juni 2025',
         'Youth Night hadir!\n📅 Sabtu 28 Juni · ⏰ 18.00 WIB · 📍 Aula Lantai 2\nDress code: Casual. Bawa teman! 🔥',
         'acara', 0, 1)
    `);

    await conn.query(`
      INSERT INTO jadwal (nama, hari, jam, ikon, aktif, urutan) VALUES
        ('Ibadah Raya',     'Minggu', '09.00 WIB', '⛪', 1, 1),
        ('Praise & Worship','Sabtu',  '18.00 WIB', '🎶', 0, 2),
        ('Sel Group',       'Rabu',   '19.00 WIB', '📖', 0, 3),
        ('Doa Bersama',     'Jumat',  '18.30 WIB', '🙏', 0, 4),
        ('Ibadah Pemuda',   'Sabtu',  '15.00 WIB', '🔥', 0, 5)
    `);

    console.log('✅ Seed data berhasil!');
  } finally {
    conn.release();
  }
}

module.exports = { migrate };
