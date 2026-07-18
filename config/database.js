const mysql = require('mysql2/promise');
require('dotenv').config();

// Railway menyediakan DATABASE_URL atau variabel terpisah MYSQLHOST dll
let poolConfig;

if (process.env.DATABASE_URL) {
  // Format: mysql://user:password@host:port/database
  poolConfig = {
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
} else {
  poolConfig = {
    host:     process.env.MYSQLHOST     || 'localhost',
    port:     parseInt(process.env.MYSQLPORT || '3306'),
    user:     process.env.MYSQLUSER     || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'adullam',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
}

const pool = process.env.DATABASE_URL
  ? mysql.createPool(process.env.DATABASE_URL)
  : mysql.createPool(poolConfig);

// Test connection
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL terhubung ke Railway!');
    conn.release();
  } catch (err) {
    console.error('❌ Gagal koneksi MySQL:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
