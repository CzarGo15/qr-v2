const admin = require('firebase-admin');

const serviceAccount = JSON.parse(
process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log('✅ Firebase conectado correctamente');

module.exports = db;
