
const codes = require('./codes.json');

const GEMINI_MODEL = 'gemini-2.5-flash';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Metodo no permitido' } });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { code, prompt, generationConfig } = body || {};

  if (!code || !prompt) {
    res.status(400).json({ error: { message: 'Falta el codigo de acceso o el contenido a procesar.' } });
    return;
  }

  const entry = codes[code];
  if (!entry) {
    res.status(403).json({ error: { message: 'Codigo de acceso invalido. Contacta a tu proveedor de DentaNota.' } });
    return;
  }

  if (entry.vence) {
    const hoy = new Date();
    const vence = new Date(entry.vence + 'T23:59:59');
    if (hoy > vence) {
      res.status(403).json({ error: { message: 'Tu periodo de prueba termino el ' + entry.vence + '. Contacta a tu proveedor de DentaNota para activar tu suscripcion y seguir usando la IA.' } });
      return;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Configuracion del servidor incompleta: falta la API key de Gemini en las variables de entorno de Vercel.' } });
    return;
  }

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: generationConfig || {}
        })
      }
    );
    const data = await geminiRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: 'Error al conectar con Gemini: ' + err.message } });
  }
};
