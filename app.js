const form = document.querySelector("#chat-form");
const input = document.querySelector("#user-input");
const conversation = document.querySelector("#conversation");
const activityList = document.querySelector("#activity-list");
const sendButton = form.querySelector("button[type='submit']");
const statusText = document.querySelector("#connection-status");
const statusDot = document.querySelector("#status-dot");
const arena = document.querySelector("#agent-arena");
const agentOrb = document.querySelector("#agent-orb");
const positionLabel = document.querySelector("#agent-position");
const pauseButton = document.querySelector("#pause-agent");

function setStatus(online) {
  statusText.textContent = online ? "Local agent ready" : "Start the local server";
  statusDot.classList.toggle("online", online);
  statusDot.classList.toggle("offline", !online);
}

async function checkStatus() {
  try {
    const response = await fetch("/api/health");
    setStatus(response.ok);
  } catch {
    setStatus(false);
  }
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
  while (activityList.children.length > 6) activityList.lastElementChild.remove();
}

async function sendMessage(message) {
  const cleanMessage = message.trim();
  if (!cleanMessage || sendButton.disabled) return;
  addMessage("user", cleanMessage);
  input.value = "";
  sendButton.disabled = true;
  sendButton.textContent = "Working…";
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: cleanMessage }),
    });
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

const environments = {
  calm: { x: 0.23, y: 0.17, rate: 1 },
  curious: { x: 0.36, y: 0.27, rate: 1.45 },
  focused: { x: 0.12, y: 0.1, rate: 0.72 },
};
let environment = environments.calm;
let selectedMode = "calm";
let paused = false;
let animationFrame = 0;
let startedAt = 0;

function animateAgent(now) {
  if (!startedAt) startedAt = now;
  const bounds = arena.getBoundingClientRect();
  const elapsed = (now - startedAt) / 1000 * environment.rate;
  const xRoom = Math.max(0, (bounds.width - agentOrb.offsetWidth - 36) / 2);
  const yRoom = Math.max(0, (bounds.height - agentOrb.offsetHeight - 60) / 2);
  // Layered, slow sine waves create a gentle meandering path rather than player-like controls.
  const x = bounds.width / 2 + xRoom * environment.x * (Math.sin(elapsed * .31) + .32 * Math.sin(elapsed * .73 + 1.4));
  const y = bounds.height / 2 + yRoom * environment.y * (Math.sin(elapsed * .23 + 2.1) + .28 * Math.sin(elapsed * .57));
  const xPercent = x / bounds.width * 100;
  const yPercent = y / bounds.height * 100;
  agentOrb.style.left = `${xPercent}%`;
  agentOrb.style.top = `${yPercent}%`;
  positionLabel.textContent = `x: ${Math.round(xPercent)} · y: ${Math.round(yPercent)}`;
  animationFrame = requestAnimationFrame(animateAgent);
}

function startAgent() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  startedAt = 0;
  animationFrame = requestAnimationFrame(animateAgent);
}

function setPaused(shouldPause) {
  paused = shouldPause;
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.textContent = paused ? "Resume agent" : "Pause agent";
  arena.classList.toggle("is-paused", paused);
  if (paused) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  } else {
    startAgent();
  }
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedMode = button.dataset.mode;
    environment = environments[selectedMode];
    document.querySelectorAll(".mode-button").forEach((modeButton) => {
      const active = modeButton === button;
      modeButton.classList.toggle("is-active", active);
      modeButton.setAttribute("aria-pressed", String(active));
    });
    if (!paused) startAgent();
    addActivity(`Set environment to ${selectedMode}`);
  });
});

pauseButton.addEventListener("click", () => setPaused(!paused));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
if (!motionPreference.matches) startAgent();
else agentOrb.style.left = "50%";
motionPreference.addEventListener?.("change", (event) => {
  if (event.matches) setPaused(true);
});
window.addEventListener("resize", () => {
  if (!paused && !motionPreference.matches) startAgent();
});

checkStatus();
