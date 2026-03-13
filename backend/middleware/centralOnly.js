// middleware/centralOnly.js — Solo permite acceso desde dominio central con usuario central
module.exports = (req, res, next) => {
  if (req.tenant) {
    return res.status(403).json({ error: 'Acceso solo desde dominio principal' });
  }
  if (!req.user?.isCentral) {
    return res.status(403).json({ error: 'Acceso solo para administradores centrales' });
  }
  next();
};
