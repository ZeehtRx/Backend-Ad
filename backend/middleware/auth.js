const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Token tidak ditemukan. Silakan login.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Belum login.' });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ success: false, message: `Akses ditolak. Butuh role: ${roles.join('/')}` });
    next();
  };
}

module.exports = { authMiddleware, requireRole };
