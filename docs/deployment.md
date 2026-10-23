# Deploying Sahoo Shop to Firebase App Hosting

## Prerequisites
- A Google account, a billing account (App Hosting needs the Blaze plan, and typical small-shop usage stays within the free quotas), Node.js 22, and the Firebase CLI (`npm i -g firebase-tools`).
- The repository pushed to GitHub (App Hosting deploys from a GitHub branch).

## 1. Create the Firebase project
1. In the [Firebase console](https://console.firebase.google.com/), create a project, for example `sahoo-shop-prod`, and upgrade it to Blaze.
2. **Firestore**: create the `(default)` database in **production mode**, region `asia-south1` (Mumbai).
3. **Storage**: create the default bucket in the same region.
4. **Authentication**: enable **Email/Password**. Then go to **Settings > User actions** and turn off **Enable create (sign-up)** so nobody can register. Under **Authorized domains**, add the App Hosting domain once it exists.
5. Register a **Web app** and note its `apiKey` and `appId`.

## 2. Deploy rules and indexes
```bash
firebase login
firebase use --add sahoo-shop-prod
firebase deploy --only firestore:rules,firestore:indexes,storage
```
Wait for every index to show **Enabled** under Firestore > Indexes before using the app.

## 3. Configure App Hosting
1. Replace every `REPLACE_WITH_PROJECT_ID` in `apphosting.yaml`.
2. Create the backend and connect the GitHub repository (live branch `main`, root directory `/`):
   ```bash
   firebase apphosting:backends:create --project sahoo-shop-prod --location asia-south1
   ```
3. Store the web config values as secrets. These values are public, but secrets keep them out of the repository:
   ```bash
   firebase apphosting:secrets:set firebase-web-api-key
   firebase apphosting:secrets:set firebase-web-app-id
   firebase apphosting:secrets:grantaccess firebase-web-api-key,firebase-web-app-id --backend BACKEND_ID
   ```
4. Push to `main`. App Hosting builds and rolls out automatically. The server uses the backend's service account (Application Default Credentials), so **no service account key is ever stored**.

## 4. Create the administrator
From your machine, authenticated as a project owner:
```bash
gcloud auth application-default login
FIREBASE_PROJECT_ID=sahoo-shop-prod npm run create-admin -- owner@example.com "a long unique password"
```
Run it again to reset the password. The script also revokes existing sessions.

## 5. Backups and budget alerts
- Set up backups with [the backup runbook](runbooks/backup-restore.md).
- Create a budget with alerts at 50%, 90%, and 100%:
  ```bash
  gcloud billing budgets create --billing-account=BILLING_ACCOUNT_ID \
    --display-name="Sahoo Shop monthly" --budget-amount=500INR \
    --filter-projects=projects/sahoo-shop-prod \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
  ```

## 6. Go-live checklist
- [ ] `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run test:e2e:ci` pass on `main`.
- [ ] Sign-up is disabled, and only the administrator account exists in Authentication.
- [ ] Firestore and Storage rules are deployed (deny all client access), and the Rules Playground denies a read of `/products/x`.
- [ ] All composite indexes are **Enabled**.
- [ ] Shop name, address, and invoice prefixes are set in **Settings**.
- [ ] Opening stock is entered for every product, and `npm run verify-ledger` is clean.
- [ ] A daily backup exists, and a test restore into a scratch database passed `verify-ledger`.
- [ ] The budget alert email reaches the owner.

## Cost notes
- All reads go through the server: the dashboard reads about 100 small documents, lists are capped (300 to 500 rows), and reports read only the selected range.
- Large embedded fields (line items, per-product daily sales, archive ID lists) are excluded from indexing in `firestore.indexes.json`, which reduces storage and write costs.
- `minInstances: 0` in `apphosting.yaml` means no cost while idle. Expect a few seconds of cold start on the first request of the day.
