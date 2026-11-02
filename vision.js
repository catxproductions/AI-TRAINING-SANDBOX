// Sensor/telemetry layer for the local agent simulation. The agents remain autonomous;
// this module observes their world state and renders concise state updates in the UI.
const lastVisionState = new Map();
const lastPositions = new Map();
let observationInFlight = false;

function collectAgentObservation(agent) {
  const bounds = arena.getBoundingClientRect();
  const obstacles = worldObjects.filter((object) => object.type === "obstacle").map(({ x, y }) => ({ x, y }));
  const goal = worldObjects.find((object) => object.type === "goal" && !object.completed);
  return {
    agent_id: String(agent.id),
    x: agent.x,
    y: agent.y,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    obstacles,
    goal: goal ? { x: goal.x, y: goal.y } : null,
    reached: Boolean(goal?.completed),
  };
}

function applyVisionUpdate(update) {
  const agent = agents.find((candidate) => String(candidate.id) === update.agent_id);
  if (!agent) return;

  agent.vision = update.nearby_obstacles;
  const previousState = lastVisionState.get(agent.id) || "calm";
  agent.element.classList.toggle("is-frustrated", update.state === "frustrated");
  agent.element.dataset.state = update.state;
  agent.element.setAttribute("aria-label", `AI agent ${agent.id}, ${update.state}, detected ${update.nearby_obstacles.length} nearby obstacles`);
  if (update.state !== previousState) {
    lastVisionState.set(agent.id, update.state);
    if (update.state === "frustrated") {
      const reason = update.reason || "difficulty making progress";
      addActivity(`Agent ${agent.id} is frustrated: ${reason}`);
      feedback.textContent = `Agent ${agent.id} is frustrated (${update.frustration}/3): ${reason}.`;
    } else if (previousState === "frustrated") {
      addActivity(`Agent ${agent.id} recovered and is making progress`);
      feedback.textContent = `Agent ${agent.id} recovered and is moving again.`;
    }
  }
  if (update.nearby_obstacles.length) {
    const obstacle = update.nearby_obstacles[0];
    agent.nearestObstacle = obstacle;
    // Simple local vision response: increase repulsion from objects within the sensor range.
    const dx = (agent.x - obstacle.x) * arena.clientWidth;
    const dy = (agent.y - obstacle.y) * arena.clientHeight;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance < 92) {
      const impulse = (92 - distance) * 0.07;
      agent.vx += dx / distance * impulse;
      agent.vy += dy / distance * impulse;
    }
  } else {
    agent.nearestObstacle = null;
  }
  const goalCount = worldObjects.filter((object) => object.type === "goal" && !object.completed).length;
  const frustratedCount = agents.filter((item) => item.element.classList.contains("is-frustrated")).length;
  worldStatus.textContent = `${agents.length} ${agents.length === 1 ? "agent" : "agents"} · ${goalCount} ${goalCount === 1 ? "goal" : "goals"} · ${worldObjects.filter((item) => item.type === "obstacle").length} obstacles${frustratedCount ? ` · ${frustratedCount} frustrated` : ""}`;
}

async function sendSimulationObservations() {
  if (observationInFlight || !agents.length || !arena.isConnected) return;
  observationInFlight = true;
  try {
    const updates = await Promise.all(agents.map(async (agent) => {
      const response = await fetch("/api/simulation/observe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectAgentObservation(agent)),
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.state_update;
    }));
    updates.filter(Boolean).forEach(applyVisionUpdate);
  } catch {
    // The animation remains playable without telemetry if the local API is temporarily unavailable.
  } finally {
    observationInFlight = false;
  }
}

window.setInterval(sendSimulationObservations, 650);
sendSimulationObservations();
