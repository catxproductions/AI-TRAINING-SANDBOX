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

function moveAgent(clientX, clientY) {
  const bounds = arena.getBoundingClientRect();
  const margin = agentOrb.offsetWidth / 2 + 5;
  const x = Math.max(margin, Math.min(bounds.width - margin, clientX - bounds.left));
  const y = Math.max(margin, Math.min(bounds.height - margin, clientY - bounds.top));
  const xPercent = (x / bounds.width) * 100;
  const yPercent = (y / bounds.height) * 100;
  agentOrb.style.left = `${xPercent}%`;
  agentOrb.style.top = `${yPercent}%`;
  positionLabel.textContent = `x: ${Math.round(xPercent)} · y: ${Math.round(yPercent)}`;
  arena.classList.add("agent-moved");
}

arena.addEventListener("pointerdown", (event) => {
  if (event.target === agentOrb) return;
  moveAgent(event.clientX, event.clientY);
});

agentOrb.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 12 : 5;
  const directions = {
    ArrowUp: [0, -step], w: [0, -step], W: [0, -step],
    ArrowDown: [0, step], s: [0, step], S: [0, step],
    ArrowLeft: [-step, 0], a: [-step, 0], A: [-step, 0],
    ArrowRight: [step, 0], d: [step, 0], D: [step, 0],
  };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  const bounds = arena.getBoundingClientRect();
  const currentX = (parseFloat(agentOrb.style.left) || 50) / 100 * bounds.width;
  const currentY = (parseFloat(agentOrb.style.top) || 50) / 100 * bounds.height;
  moveAgent(bounds.left + currentX + direction[0], bounds.top + currentY + direction[1]);
});

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

checkStatus();
