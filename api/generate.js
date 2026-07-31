
const admin = require('firebase-admin');

const GEMINI_MODEL = 'gemini-2.5-flash';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Metodo no permitido' } });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { idToken, prompt, generationConfig } = body || {};

  if (!idToken || !prompt) {
    res.status(400).json({ error: { message: 'Falta la sesion o el contenido a procesar.' } });
    return;
  }

  // 1) Verificar que la sesion de Firebase sea valida (el dentista esta realmente logueado)
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    res.status(401).json({ error: { message: 'Tu sesion no es valida o expiro. Vuelve a iniciar sesion.' } });
    return;
  }
  const uid = decoded.uid;

  // 2) Verificar que la cuenta este activa y vigente en Firestore
  let userDoc;
  try {
    const snap = await db.collection('users').doc(uid).get();
    userDoc = snap.exists ? snap.data() : null;
  } catch (e) {
    res.status(500).json({ error: { message: 'No se pudo verificar tu cuenta. Intenta de nuevo.' } });
    return;
  }

  if (!userDoc || userDoc.activo !== true) {
    res.status(403).json({ error: { message: 'Tu cuenta de DentaNota no esta activa. Contacta a tu proveedor para activarla.' } });
    return;
  }
  if (userDoc.vence) {
    const hoy = new Date();
    const vence = new Date(userDoc.vence + 'T23:59:59');
    if (hoy > vence) {
      res.status(403).json({ error: { message: 'Tu suscripcion vencio el ' + userDoc.vence + '. Contacta a tu proveedor de DentaNota para renovarla.' } });
      return;
    }
  }

  // 3) Llamar a Gemini solo si todo lo anterior paso
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
