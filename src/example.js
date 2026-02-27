/* eslint-disable @typescript-eslint/no-require-imports */
const { ExerciseApiClient } = require("./exerciseApiClient");

async function main() {
  const client = ExerciseApiClient.fromEnv();

  const status = await client.getServerStatus();
  console.log("Server status:", status);

  const bySearch = await client.searchExercises({ search: "chest press" });
  console.log("Search results:", bySearch);

  const allExercises = await client.getExercises({
    name: "Bench Press",
    keywords: "chest,workout,barbell",
  });
  console.log("Get exercises:", allExercises);

  const allWorkouts = await client.getAllWorkouts({ limit: 100, maxPages: 50 });
  console.log(`Fetched ${allWorkouts.length} workouts from ExerciseDB API`);
  console.log("Sample workouts:", allWorkouts.slice(0, 3));
}

main().catch((error) => {
  console.error("Example failed:", {
    message: error.message,
    status: error.status,
    payload: error.payload,
  });
  process.exitCode = 1;
});
