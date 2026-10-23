# Backup and restore runbook

Sahoo Shop keeps all business data in Cloud Firestore (`(default)` database) and archive workbooks in Cloud Storage (`archives/`). This runbook sets up automatic backups and explains how to restore them.

Replace `PROJECT_ID`, `REGION` (for example `asia-south1`), and `BUCKET` with your own values. Run commands in Cloud Shell or with an authenticated `gcloud`.

## 1. One-time setup

### Daily and weekly Firestore backups

Firestore managed backups are billed only for the storage they use.

```bash
gcloud config set project PROJECT_ID

# Daily backups kept for 14 days.
gcloud firestore backups schedules create \
  --database='(default)' --recurrence=daily --retention=14d

# Weekly backups (Sunday) kept for 14 weeks.
gcloud firestore backups schedules create \
  --database='(default)' --recurrence=weekly --day-of-week=SUN --retention=14w

gcloud firestore backups schedules list --database='(default)'
```

### Monthly long-term export (optional, cheapest long-term copy)

```bash
gsutil mb -l REGION -c NEARLINE gs://PROJECT_ID-firestore-exports
gcloud firestore export gs://PROJECT_ID-firestore-exports/$(date +%Y-%m-%d)
```

Automate it with Cloud Scheduler, using the Firestore export API with the `datastore.importExportAdmin` role, or run it by hand on the first of each month.

### Protect archive workbooks

```bash
gsutil versioning set on gs://BUCKET
# Keep deleted or overwritten archive files for 365 days.
cat > lifecycle.json <<'EOF'
{"rule":[{"action":{"type":"Delete"},"condition":{"isLive":false,"daysSinceNoncurrentTime":365}}]}
EOF
gsutil lifecycle set lifecycle.json gs://BUCKET
```

## 2. Checking backups

Do this monthly, and always before archiving:

```bash
gcloud firestore backups list --format="table(name, snapshotTime, state)"
```

Confirm the latest backup is less than 24 hours old and `READY`.

## 3. Restoring

Firestore restores always go into a **new** database. The live database is never overwritten, so a restore is safe to try.

1. Pick the backup:
   ```bash
   gcloud firestore backups list
   ```
2. Restore it into a new database:
   ```bash
   gcloud firestore databases restore \
     --source-backup=projects/PROJECT_ID/locations/REGION/backups/BACKUP_ID \
     --destination-database=restore-$(date +%Y%m%d)
   ```
3. Deploy rules and indexes to the restored database. Add a second entry with `"database": "restore-YYYYMMDD"` under `firestore` in `firebase.json`, then run `firebase deploy --only firestore`.
4. Verify the data from your machine (read-only):
   ```bash
   gcloud auth application-default login
   FIREBASE_PROJECT_ID=PROJECT_ID FIRESTORE_DATABASE_ID=restore-YYYYMMDD npm run verify-ledger
   ```
   It must print "No integrity problems found."
5. Switch the app to the restored database by adding to `apphosting.yaml`:
   ```yaml
   - variable: FIRESTORE_DATABASE_ID
     value: restore-YYYYMMDD
     availability: [RUNTIME]
   ```
   Commit and push to roll out. Keep the old database until you are sure, then delete it:
   `gcloud firestore databases delete --database='(default)'` (irreversible, so take one more backup first).

### Restoring from a monthly export instead

```bash
gcloud firestore import gs://PROJECT_ID-firestore-exports/YYYY-MM-DD --database=restore-YYYYMMDD
```

## 4. Recovering a single mistaken transaction

Do not restore a backup for one bad entry. Use **Reverse** on the sale, purchase, or payment, or **Void** on an expense. Reversals are recorded, audited, and keep stock and balances consistent.
