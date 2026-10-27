/**
 * One-time sync: disable Auth for users who were banned/suspended before
 * onModerationStateChanged existed. Safe to re-run.
 *
 * Usage (from functions/):
 *   node sync-moderation-auth.js          # dry run, lists affected users
 *   node sync-moderation-auth.js --write  # apply
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

// Required after initializeApp: the module uses the default app.
const { syncModerationAuthState } = require('./moderationAuthUtils');

async function run() {
  const snap = await admin.firestore().collectionGroup('private').get();
  const blocked = snap.docs.filter((d) => {
    if (d.id !== 'account') return false;
    const data = d.data();
    return data.banned === true || data.suspendedUntil?.toMillis?.() > Date.now();
  });

  console.log(`Project: ${projectId}`);
  console.log(`Banned/suspended users: ${blocked.length}`);
  blocked.forEach((d) => {
    const data = d.data();
    console.log(`  ${d.ref.parent.parent.id}  ${data.banned ? 'banned' : `suspended until ${data.suspendedUntil.toDate().toISOString()}`}`);
  });

  if (!shouldWrite) {
    console.log('Dry run. Re-run with --write to apply.');
    return;
  }

  for (const d of blocked) {
    await syncModerationAuthState(d.ref.parent.parent.id, d.data());
  }
  console.log(`Synced ${blocked.length} users.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
