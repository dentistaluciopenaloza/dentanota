const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// Otorga una prueba gratuita de 30 dias a una cuenta recien creada.
// Solo el servidor (con la llave de administrador) puede escribir los
// campos activo/plan/vence -- el cliente nunca puede tocarlos directamente,
// para que nadie pueda activarse a si mismo desde el navegador.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Metodo no permitido' } });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { idToken } = body || {};
  if (!idToken) {
    res.status(400).json({ error: { message: 'Falta la sesion.' } });
    return;
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    res.status(401).json({ error: { message: 'Sesion invalida.' } });
    return;
  }
  const uid = decoded.uid;

  try {
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (snap.exists && snap.data().plan) {
      // Ya tiene un plan asignado (prueba ya usada o cuenta ya gestionada manualmente): no se toca.
      res.status(200).json({ ok: true, already: true });
      return;
    }
    const vence = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await ref.set({
      activo: true,
      plan: 'prueba',
      vence,
      correo: decoded.email || '',
      creadoEn: new Date().toISOString()
    }, { merge: true });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: { message: 'No se pudo activar la prueba: ' + err.message } });
  }
};
