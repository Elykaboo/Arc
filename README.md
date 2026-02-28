# Arc

A Next.js workout planner with local API routes and a reusable RapidAPI ExerciseDB client.

## What works now

- Workout library at `/workouts` with search/filtering and detail pages
- Weekly planner at `/planner` with sets/reps editing and local draft persistence
- Print-friendly weekly view at `/print/weekly`
- Local API endpoints under `app/api/v1`:
  - `GET /api/v1/liveness`
  - `GET /api/v1/exercises`
  - `GET /api/v1/exercises/search`
  - `GET /api/v1/exercises/:id`
  - `GET /api/v1/muscles`
  - `GET /api/v1/bodyparts`
  - `GET /api/v1/equipments`
  - `GET /api/v1/exercisetypes`

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Firebase auth setup

The `/login` and `/signup` pages use Firebase Authentication (email/password).

Create a `.env.local` file in the project root with your Firebase web app values:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."
```

In Firebase Console, also enable `Authentication -> Sign-in method -> Email/Password`.

## Firestore database setup

The planner now saves to Firestore for logged-in users and falls back to local storage when logged out.

1. In Firebase Console, create Firestore database for project `gymplanner-f0b56`.
2. Install Firebase CLI and log in:

```bash
npm install -g firebase-tools
firebase login
```

3. Link this project and deploy rules/indexes from the repo:

```bash
firebase use gymplanner-f0b56
firebase deploy --only firestore:rules,firestore:indexes
```

Firestore files are already included:
- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`

## Ngrok for live client access

1. Create/sign in to your ngrok account and copy your auth token from the ngrok dashboard.
2. Authenticate once on your machine:

```bash
npx ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
```

3. Start the local app:

```bash
npm run dev
```

4. In a second terminal, start the tunnel:

```bash
npm run tunnel
```

5. Share the `https://...ngrok-free.app` URL with your client.

Optional single command (runs app + tunnel together):

```bash
npm run dev:public
```

## RapidAPI client

`src/exerciseApiClient.js` provides a Node client for ExerciseDB (AscendAPI on RapidAPI).

Environment variables:

```bash
export RAPIDAPI_KEY="your-x-rapidapi-key"
export RAPIDAPI_HOST="edb-with-videos-and-images-by-ascendapi.p.rapidapi.com"

# optional (defaults shown)
export EXERCISE_API_BASE_URL="https://edb-with-videos-and-images-by-ascendapi.p.rapidapi.com"
export EXERCISE_API_VERSION="/api/v1"
```

Example usage:

```bash
node src/example.js
```

## Local checks

```bash
npm run lint
node --check src/exerciseApiClient.js
node --check src/example.js
node src/exerciseApiClient.test.js
```
