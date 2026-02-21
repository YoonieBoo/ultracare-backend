const admin = require("firebase-admin");
const path = require("path");

function initFirebaseAdmin() {
  if (admin.apps.length) return admin;

  // local dev: load the downloaded firebase service account JSON
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!p) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_PATH in .env");

  const abs = path.resolve(p);

  admin.initializeApp({
    credential: admin.credential.cert(require(abs)),
  });

  return admin;
}

module.exports = { initFirebaseAdmin };
