/**
 * Grant admin custom claim to a Firebase Auth user.
 *
 * Usage (from functions/):
 *   node set-admin.js <USER_UID>
 *
 * Credentials (pick one):
 *   1. Put key at ../secrets/firebase-service-account.json (gitignored)
 *   2. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 *   3. gcloud auth application-default login --project meetup-mobile
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const uid = process.argv[2];

if (!uid) {
  console.error('Usage: node set-admin.js <USER_UID>');
  process.exit(1);
}

function getProjectId() {
  const fromEnv = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (fromEnv) return fromEnv;

  try {
    const rc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.firebaserc'), 'utf8'));
    if (rc.projects?.default) return rc.projects.default;
  } catch {
    // ignore
  }

  return 'meetup-mobile';
}

function getCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.applicationDefault();
  }

  const localKey = path.join(__dirname, '..', 'secrets', 'firebase-service-account.json');
  if (fs.existsSync(localKey)) {
    return admin.credential.cert(JSON.parse(fs.readFileSync(localKey, 'utf8')));
  }

  return admin.credential.applicationDefault();
}

const projectId = getProjectId();

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
    credential: getCredential(),
  });
}

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`Project: ${projectId}`);
    console.log(`Admin claim set for uid: ${uid}`);
    console.log('Sign out and sign in again in the app to refresh the token.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed:', err.message);
    console.error(
      '\n1. Firebase Console → Project settings → Service accounts\n' +
        '   → Generate new private key\n' +
        '2. Save as: secrets/firebase-service-account.json (project root)\n' +
        '3. Run: cd functions && node set-admin.js <USER_UID>'
    );
    process.exit(1);
  });
