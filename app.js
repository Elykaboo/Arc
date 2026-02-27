const workouts = [
  { name: "Upper Body Strength", focus: "Chest & Back", duration: 60, difficulty: "Intermediate", status: "Completed" },
  { name: "Lower Body Power", focus: "Legs", duration: 50, difficulty: "Advanced", status: "Upcoming" },
  { name: "Core Stability", focus: "Core", duration: 35, difficulty: "Beginner", status: "Completed" },
  { name: "HIIT Blast", focus: "Full Body", duration: 30, difficulty: "Intermediate", status: "Upcoming" },
  { name: "Mobility Flow", focus: "Recovery", duration: 25, difficulty: "Beginner", status: "Upcoming" },
  { name: "Push Day", focus: "Chest, Shoulders, Triceps", duration: 55, difficulty: "Intermediate", status: "Completed" }
];

const workoutList = document.getElementById("workoutList");
const searchInput = document.getElementById("workoutSearch");
const emptyState = document.getElementById("emptyState");

const metricElements = {
  totalWorkouts: document.getElementById("totalWorkouts"),
  completedWorkouts: document.getElementById("completedWorkouts"),
  avgDuration: document.getElementById("avgDuration"),
  upcomingWorkouts: document.getElementById("upcomingWorkouts")
};

function renderDashboard(data) {
  const total = data.length;
  const completed = data.filter((workout) => workout.status === "Completed").length;
  const upcoming = data.filter((workout) => workout.status === "Upcoming").length;
  const avgDuration = total ? Math.round(data.reduce((sum, workout) => sum + workout.duration, 0) / total) : 0;

  metricElements.totalWorkouts.textContent = String(total);
  metricElements.completedWorkouts.textContent = String(completed);
  metricElements.upcomingWorkouts.textContent = String(upcoming);
  metricElements.avgDuration.textContent = `${avgDuration} min`;
}

function renderWorkouts(data) {
  workoutList.innerHTML = "";

  if (!data.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  data.forEach((workout) => {
    const item = document.createElement("li");
    item.className = "workout-item";

    const statusClass = workout.status === "Completed" ? "status-completed" : "status-upcoming";

    item.innerHTML = `
      <div class="workout-item-header">
        <h3>${workout.name}</h3>
        <span class="status-pill ${statusClass}">${workout.status}</span>
      </div>
      <p class="meta">Focus: ${workout.focus}</p>
      <p class="meta">Difficulty: ${workout.difficulty} • Duration: ${workout.duration} min</p>
    `;

    workoutList.appendChild(item);
  });
}

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();

  const filteredWorkouts = workouts.filter((workout) => {
    const values = [workout.name, workout.focus, workout.difficulty, workout.status].join(" ").toLowerCase();
    return values.includes(query);
  });

  renderDashboard(filteredWorkouts);
  renderWorkouts(filteredWorkouts);
}

searchInput.addEventListener("input", applySearch);

renderDashboard(workouts);
renderWorkouts(workouts);
