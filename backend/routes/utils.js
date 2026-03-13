const router = require('express').Router();
const auth = require('../middleware/authMiddleware');

// POST /api/utils/resolve-maps-url
// Resuelve URLs cortas de Google Maps (maps.app.goo.gl/xxx) siguiendo redirects
router.post('/resolve-maps-url', auth, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL requerida' });
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AquaControl/1.0)' },
    });
    const finalUrl = response.url;

    // Extraer coordenadas de la URL final
    const match = finalUrl.match(/([-]?\d{1,2}\.\d{4,}),\s*([-]?\d{1,3}\.\d{4,})/);
    if (!match) {
      return res.status(404).json({ error: 'No se encontraron coordenadas en la URL' });
    }

    res.json({ lat: parseFloat(match[1]), lng: parseFloat(match[2]) });
  } catch (err) {
    res.status(500).json({ error: 'Error al resolver URL: ' + err.message });
  }
});

module.exports = router;
