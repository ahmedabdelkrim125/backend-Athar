let firebaseAdmin;
let firebaseApp;

function isFirebaseConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

function getFirebaseApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  if (!firebaseAdmin) {
    firebaseAdmin = require('firebase-admin');
  }

  if (!firebaseApp) {
    firebaseApp =
      firebaseAdmin.apps[0] ||
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
  }

  return firebaseApp;
}

async function sendMulticast(tokens, message) {
  const app = getFirebaseApp();

  if (!app || tokens.length === 0) {
    return null;
  }

  return firebaseAdmin.messaging(app).sendEachForMulticast({
    tokens,
    notification: {
      title: message.title,
      body: message.body,
    },
    data: Object.fromEntries(
      Object.entries(message.data || {}).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ]),
    ),
  });
}

module.exports = {
  isFirebaseConfigured,
  sendMulticast,
};
