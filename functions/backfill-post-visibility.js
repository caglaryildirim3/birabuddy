/**
 * Set visibility: 'public' on legacy posts that have no visibility field,
 * so they match the feed's `where('visibility', '==', 'public')` query.
 *
 * Usage (from functions/):
 *   node backfill-post-visibility.js          # dry run, only counts
 *   node backfill-post-visibility.js --write  # apply
 *
 * Credentials: same as set-admin.js.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const shouldWrite = process.argv.includes('--write');

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

async function run() {
  const db = admin.firestore();
  const snap = await db.collection('posts').get();
  const legacy = snap.docs.filter((d) => !d.data().visibility);

  console.log(`Project: ${projectId}`);
  console.log(`Posts: ${snap.size}, missing visibility: ${legacy.length}`);

  if (!shouldWrite) {
    console.log('Dry run. Re-run with --write to apply.');
    return;
  }

  for (let i = 0; i < legacy.length; i += 400) {
    const batch = db.batch();
    legacy.slice(i, i + 400).forEach((d) => batch.update(d.ref, { visibility: 'public' }));
    await batch.commit();
  }
  console.log(`Updated ${legacy.length} posts.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
