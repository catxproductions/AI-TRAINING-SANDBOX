const form = document.querySelector("#chat-form");
const input = document.querySelector("#user-input");
const conversation = document.querySelector("#conversation");
const activityList = document.querySelector("#activity-list");
const sendButton = form.querySelector("button[type='submit']");
const statusText = document.querySelector("#connection-status");
const statusDot = document.querySelector("#status-dot");
const arena = document.querySelector("#agent-arena");
const agentLayer = document.querySelector("#agent-layer");
const worldObjectsLayer = document.querySelector("#world-objects");
const worldStatus = document.querySelector("#world-status");
const pauseButton = document.querySelector("#pause-agent");
const feedback = document.querySelector("#control-feedback");
const cancelActionButton = document.querySelector("#cancel-world-action");
const agents = [];
const worldObjects = [];
let selectedWorldAction = null;
let nextAgentId = 1;
let nextObjectId = 1;
let lastFrame = 0;
let animationFrame = 0;
let paused = false;
let selectedMode = "calm";
let reinforcement = 0;
const modeSettings = {
  calm: { speed: 34, curiosity: 0.12 },
  curious: { speed: 45, curiosity: 0.55 },
  focused: { speed: 39, curiosity: 0.03 },
};

function setStatus(online) {
  statusText.textContent = online ? "Local agent ready" : "Start the local server";
  statusDot.classList.toggle("online", online);
  statusDot.classList.toggle("offline", !online);
}

async function checkStatus() {
  try { const response = await fetch("/api/health"); setStatus(response.ok); }
  catch { setStatus(false); }
}

function addMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "Y" : "A";
  const content = document.createElement("div");
  content.className = "message-content";
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "YOU" : "SANDBOX AGENT";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  content.append(label, paragraph);
  article.append(avatar, content);
  conversation.append(article);
  conversation.scrollTop = conversation.scrollHeight;
}

function addActivity(text) {
  const empty = activityList.querySelector(".activity-empty");
  if (empty) empty.remove();
  const item = document.createElement("li");
  item.append(document.createTextNode(text));
  const time = document.createElement("span");
  time.className = "activity-time";
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  item.append(time);
  activityList.prepend(item);
  while (activityList.children.length > 8) activityList.lastElementChild.remove();
}

async function sendMessage(message) {
  const cleanMessage = message.trim();
  if (!cleanMessage || sendButton.disabled) return;
  addMessage("user", cleanMessage);
  input.value = "";
  sendButton.disabled = true;
  sendButton.textContent = "Working…";
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: cleanMessage }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The local agent could not complete that request.");
    addMessage("assistant", data.reply);
    if (data.action) addActivity(data.action);
  } catch (error) {
    addMessage("assistant", `${error.message} Make sure the Python server is running with python3 server.py.`);
    setStatus(false);
  } finally {
    sendButton.disabled = false;
    sendButton.innerHTML = 'Send <span aria-hidden="true">↗</span>';
    input.focus();
  }
}

function updateWorldStatus() {
  const goals = worldObjects.filter((object) => object.type === "goal" && !object.completed).length;
  worldStatus.textContent = `${agents.length} ${agents.length === 1 ? "agent" : "agents"} · ${goals} ${goals === 1 ? "goal" : "goals"} · ${worldObjects.filter((object) => object.type === "obstacle").length} obstacles · feedback ${reinforcement >= 0 ? "+" : ""}${reinforcement}`;
}

function createAgent(x = 0.5, y = 0.5) {
  nextAgentId += agents.length ? 1 : 0;
  const id = agents.length ? Math.max(...agents.map((agent) => agent.id)) + 1 : 1;
  nextAgentId = id + 1;
  const element = document.createElement("div");
  element.className = `agent-orb${id === 2 ? " agent-two" : id === 3 ? " agent-three" : ""}`;
  element.dataset.agentId = String(id);
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", `AI agent ${id}, moving autonomously`);
  element.textContent = id === 1 ? "AI" : `A${id}`;
  agentLayer.append(element);
  agents.push({ id, x, y, vx: 0, vy: 0, element, wander: Math.random() * Math.PI * 2, score: 0, signal: 0, lastGoalAt: 0 });
  updateWorldStatus();
  return agents[agents.length - 1];
}

function placeObject(type, x, y) {
  const object = { id: nextObjectId++, type, x, y, completed: false, element: document.createElement("div") };
  object.element.className = `world-part ${type}`;
  object.element.dataset.objectId = String(object.id);
  object.element.style.left = `${x * 100}%`;
  object.element.style.top = `${y * 100}%`;
  object.element.setAttribute("aria-label", type === "goal" ? "Agent goal" : "Obstacle");
  const label = document.createElement("span");
  label.className = "world-part-label";
  label.textContent = type === "goal" ? "GOAL" : "OBSTACLE";
  object.element.append(label);
  worldObjectsLayer.append(object.element);
  worldObjects.push(object);
  updateWorldStatus();
  return object;
}

function chooseWorldAction(action) {
  if (action === "spawn") {
    const agent = createAgent(0.18 + Math.random() * 0.64, 0.25 + Math.random() * 0.55);
    feedback.textContent = `Agent ${agent.id} added. It will pursue goals independently.`;
    addActivity(`Added autonomous agent ${agent.id}`);
    clearWorldAction();
    return;
  }
  if (action === "reward" || action === "punish") {
    selectedWorldAction = action;
    feedback.textContent = `Click near an agent to give ${action === "reward" ? "positive" : "negative"} feedback.`;
  } else {
    selectedWorldAction = action;
    feedback.textContent = action === "destroy" ? "Click an obstacle or goal in the grid to remove it." : `Click an open spot in the grid to place a ${action}.`;
  }
  document.querySelectorAll(".world-button").forEach((button) => button.classList.toggle("is-selected", button.dataset.worldAction === action));
  cancelActionButton.hidden = false;
  arena.classList.add("is-editing");
}

function clearWorldAction() {
  selectedWorldAction = null;
  document.querySelectorAll(".world-button").forEach((button) => button.classList.remove("is-selected"));
  cancelActionButton.hidden = true;
  arena.classList.remove("is-editing");
}

function nearestAgent(x, y) {
  return agents.reduce((nearest, agent) => {
    const distance = Math.hypot((agent.x - x) * arena.clientWidth, (agent.y - y) * arena.clientHeight);
    return !nearest || distance < nearest.distance ? { agent, distance } : nearest;
  }, null)?.agent;
}

function showSignal(agent, kind) {
  agent.element.classList.remove("is-rewarded", "is-punished");
  void agent.element.offsetWidth;
  agent.element.classList.add(kind === "reward" ? "is-rewarded" : "is-punished");
  window.setTimeout(() => agent.element.classList.remove("is-rewarded", "is-punished"), 900);
}

function handleArenaClick(event) {
  if (!selectedWorldAction) return;
  const bounds = arena.getBoundingClientRect();
  const x = Math.max(.05, Math.min(.95, (event.clientX - bounds.left) / bounds.width));
  const y = Math.max(.12, Math.min(.9, (event.clientY - bounds.top) / bounds.height));
  const action = selectedWorldAction;

  if (action === "goal" || action === "obstacle") {
    placeObject(action, x, y);
    feedback.textContent = `${action === "goal" ? "Goal" : "Obstacle"} placed. Agents will adapt their routes.`;
    addActivity(`Placed ${action} in the environment`);
  } else if (action === "destroy") {
    const hit = worldObjects.filter((object) => !object.completed).sort((a, b) => Math.hypot((a.x - x) * bounds.width, (a.y - y) * bounds.height) - Math.hypot((b.x - x) * bounds.width, (b.y - y) * bounds.height))[0];
    if (!hit || Math.hypot((hit.x - x) * bounds.width, (hit.y - y) * bounds.height) > 48) {
      feedback.textContent = "No nearby obstacle or goal to remove. Click closer to a world object.";
      return;
    }
    hit.element.remove();
    worldObjects.splice(worldObjects.indexOf(hit), 1);
    feedback.textContent = `Removed ${hit.type}.`;
    addActivity(`Destroyed a ${hit.type}`);
    updateWorldStatus();
  } else if (action === "reward" || action === "punish") {
    const agent = nearestAgent(x, y);
    if (!agent) return;
    const delta = action === "reward" ? 1 : -1;
    reinforcement += delta;
    agent.signal = Math.max(-4, Math.min(4, agent.signal + delta));
    agent.score += delta;
    showSignal(agent, action);
    feedback.textContent = `Agent ${agent.id} received ${action === "reward" ? "positive" : "negative"} feedback (${agent.score >= 0 ? "+" : ""}${agent.score}).`;
    addActivity(`${action === "reward" ? "Rewarded" : "Penalized"} agent ${agent.id} · feedback ${delta > 0 ? "+1" : "−1"}`);
    updateWorldStatus();
  }
  clearWorldAction();
}

function seekAndAvoid(agent, time, deltaSeconds) {
  const settings = modeSettings[selectedMode];
  const bounds = arena.getBoundingClientRect();
  let target = null;
  let bestDistance = Infinity;
  for (const goal of worldObjects) {
    if (goal.type !== "goal" || goal.completed) continue;
    const distance = Math.hypot((goal.x - agent.x) * bounds.width, (goal.y - agent.y) * bounds.height);
    if (distance < bestDistance) { bestDistance = distance; target = goal; }
  }

  let desiredX = Math.sin(time * .00031 + agent.wander) * settings.curiosity * .24;
  let desiredY = Math.cos(time * .00027 + agent.wander * 1.7) * settings.curiosity * .24;
  if (target) {
    const dx = (target.x - agent.x) * bounds.width;
    const dy = (target.y - agent.y) * bounds.height;
    const length = Math.max(1, Math.hypot(dx, dy));
    desiredX += dx / length;
    desiredY += dy / length;
    if (length < 26 && time - agent.lastGoalAt > 800) {
      target.completed = true;
      target.element.classList.add("completed");
      agent.score += 3;
      agent.signal = Math.min(4, agent.signal + 1);
      agent.lastGoalAt = time;
      addActivity(`Agent ${agent.id} reached a goal · score +3`);
      updateWorldStatus();
    }
  } else {
    desiredX += Math.cos(time * .00019 + agent.wander) * .32;
    desiredY += Math.sin(time * .00023 + agent.wander * .8) * .32;
  }

  for (const obstacle of worldObjects) {
    if (obstacle.type !== "obstacle") continue;
    const dx = (agent.x - obstacle.x) * bounds.width;
    const dy = (agent.y - obstacle.y) * bounds.height;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const safeRadius = 58;
    if (distance < safeRadius) {
      const force = (safeRadius - distance) / safeRadius * 2.2;
      desiredX += dx / distance * force;
      desiredY += dy / distance * force;
    }
  }

  // Feedback modulates exploration/goal persistence; it never directly steers the agent.
  const persistence = Math.max(.55, Math.min(1.5, 1 + agent.signal * .09));
  const desiredLength = Math.max(.001, Math.hypot(desiredX, desiredY));
  const speed = settings.speed * persistence;
  const targetVx = desiredX / desiredLength * speed;
  const targetVy = desiredY / desiredLength * speed;
  const blend = Math.min(1, deltaSeconds * 1.5);
  agent.vx += (targetVx - agent.vx) * blend;
  agent.vy += (targetVy - agent.vy) * blend;
  agent.x += agent.vx * deltaSeconds / bounds.width;
  agent.y += agent.vy * deltaSeconds / bounds.height;
  const radiusX = (agent.element.offsetWidth / 2 + 5) / bounds.width;
  const radiusY = (agent.element.offsetHeight / 2 + 27) / bounds.height;
  if (agent.x < radiusX || agent.x > 1 - radiusX) { agent.x = Math.max(radiusX, Math.min(1 - radiusX, agent.x)); agent.vx *= -.4; }
  if (agent.y < radiusY || agent.y > 1 - radiusY) { agent.y = Math.max(radiusY, Math.min(1 - radiusY, agent.y)); agent.vy *= -.4; }
  agent.element.style.left = `${agent.x * 100}%`;
  agent.element.style.top = `${agent.y * 100}%`;
}

function tick(now) {
  if (paused) return;
  const deltaSeconds = Math.min(.05, lastFrame ? (now - lastFrame) / 1000 : 0);
  lastFrame = now;
  agents.forEach((agent) => seekAndAvoid(agent, now, deltaSeconds));
  animationFrame = requestAnimationFrame(tick);
}

function startSimulation() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  lastFrame = 0;
  animationFrame = requestAnimationFrame(tick);
}

function resetAgents() {
  agents.forEach((agent, index) => {
    agent.x = .18 + index * .12;
    agent.y = .48 + (index % 2) * .1;
    agent.vx = 0;
    agent.vy = 0;
    agent.score = 0;
    agent.signal = 0;
    agent.element.style.left = `${agent.x * 100}%`;
    agent.element.style.top = `${agent.y * 100}%`;
    agent.element.classList.remove("is-rewarded", "is-punished");
  });
  worldObjects.filter((object) => object.type === "goal").forEach((goal) => { goal.completed = false; goal.element.classList.remove("completed"); });
  reinforcement = 0;
  feedback.textContent = "Agents reset; environment objects are preserved.";
  addActivity("Reset all agents and feedback scores");
  updateWorldStatus();
}

document.querySelectorAll(".world-button").forEach((button) => button.addEventListener("click", () => chooseWorldAction(button.dataset.worldAction)));
cancelActionButton.addEventListener("click", clearWorldAction);
arena.addEventListener("click", handleArenaClick);
document.querySelectorAll(".world-part").forEach((part) => part.addEventListener("click", (event) => { if (selectedWorldAction) event.stopPropagation(); }));
document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => {
  selectedMode = button.dataset.mode;
  document.querySelectorAll(".mode-button").forEach((modeButton) => { const active = modeButton === button; modeButton.classList.toggle("is-active", active); modeButton.setAttribute("aria-pressed", String(active)); });
  addActivity(`Set agent behavior to ${selectedMode}`);
}));
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.textContent = paused ? "Resume simulation" : "Pause simulation";
  if (paused) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
  else startSimulation();
  feedback.textContent = paused ? "Simulation paused." : "Simulation resumed.";
});
document.querySelector("#reset-agents").addEventListener("click", resetAgents);
form.addEventListener("submit", (event) => { event.preventDefault(); sendMessage(input.value); });
document.querySelectorAll(".suggestion").forEach((button) => button.addEventListener("click", () => sendMessage(button.dataset.prompt)));
input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });

createAgent(.28, .52);
updateWorldStatus();
startSimulation();
window.addEventListener("resize", updateWorldStatus);
checkStatus();
