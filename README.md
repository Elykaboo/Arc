# GymPlanner

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
