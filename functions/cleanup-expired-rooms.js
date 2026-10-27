/**
 * One-off cleanup: delete expired rooms and their subcollections.
 *
 * Usage (from functions/):
 *   node cleanup-expired-rooms.js
 *   node cleanup-expired-rooms.js --dry-run
 *
 * Credentials: same as set-admin.js
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { isRoomExpired, cleanupOrphanRoomTrees } = require('./roomCleanupUtils');

const dryRun = process.argv.includes('--dry-run');

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

const db = admin.firestore();

async function main() {
  const now = new Date();
  const roomsSnap = await db.collection('rooms').get();
  const toDelete = roomsSnap.docs.filter((roomDoc) => isRoomExpired(roomDoc.data(), now));

  console.log(`Project: ${projectId}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'delete'}`);
  console.log(`Total rooms: ${roomsSnap.size}, expired: ${toDelete.length}`);

  for (const roomDoc of toDelete) {
    const room = roomDoc.data();
    const label = room.name || roomDoc.id;
    if (dryRun) {
      console.log(`  would delete: ${label} (${roomDoc.id})`);
      continue;
    }

    await db.recursiveDelete(roomDoc.ref);
    console.log(`  deleted: ${label} (${roomDoc.id})`);
  }

  console.log(dryRun ? 'Dry run complete.' : `Deleted ${toDelete.length} expired room(s).`);

  if (dryRun) {
    const { getRoomIdsWithSubcollections } = require('./roomCleanupUtils');
    const roomIds = await getRoomIdsWithSubcollections(db);
    const existing = new Set(roomsSnap.docs.map((d) => d.id));
    const orphans = [...roomIds].filter((id) => !existing.has(id));
    console.log(`Orphan room paths (subcollections only): ${orphans.length}`);
    return;
  }

  const orphansDeleted = await cleanupOrphanRoomTrees(db);
  console.log(`Deleted ${orphansDeleted} orphan room path(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
