/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("assert");
const { ExerciseApiClient } = require("./exerciseApiClient");

async function testHeadersAndUrl() {
  let calledUrl = "";
  let calledInit = null;

  global.fetch = async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
      text: async () => "",
    };
  };

  const client = new ExerciseApiClient({
    rapidApiKey: "key123",
    rapidApiHost: "host.test",
  });

  await client.getServerStatus();

  assert.equal(
    calledUrl,
    "https://edb-with-videos-and-images-by-ascendapi.p.rapidapi.com/api/v1/liveness"
  );
  assert.equal(calledInit.headers["x-rapidapi-key"], "key123");
  assert.equal(calledInit.headers["x-rapidapi-host"], "host.test");
}

async function testGetAllWorkoutsPagination() {
  const pages = [
    [{ id: 1 }, { id: 2 }],
    [{ id: 3 }],
  ];
  let i = 0;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => pages[i++] || [],
    text: async () => "",
  });

  const client = new ExerciseApiClient({ rapidApiHost: "host.test" });
  const workouts = await client.getAllWorkouts({ limit: 2, maxPages: 10 });
  assert.equal(workouts.length, 3);
}

(async () => {
  await testHeadersAndUrl();
  await testGetAllWorkoutsPagination();
  console.log("exerciseApiClient tests passed");
})();
