"""Serve the static sandbox UI plus local chat and simulation observation APIs."""

from __future__ import annotations

import json
import math
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from agent import LocalAgent

ROOT = Path(__file__).resolve().parent
AGENT = LocalAgent()
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
    "/vision.js": "vision.js",
}
MAX_BODY_BYTES = 16_384
VISION_RADIUS_PX = 125
STUCK_AFTER_SECONDS = 3.0
GOAL_TIMEOUT_SECONDS = 25.0


class SimulationMonitor:
    """Track simple position-based stuck/goal-failure state for each sandbox agent."""

    def __init__(self) -> None:
        self._states: dict[str, dict[str, object]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _distance(a: tuple[float, float], b: tuple[float, float], width: float, height: float) -> float:
        return math.hypot((a[0] - b[0]) * width, (a[1] - b[1]) * height)

    def observe(self, observation: dict[str, object], now: float | None = None) -> dict[str, object]:
        """Return nearby-obstacle perception and a bounded frustration-state update."""
        timestamp = time.monotonic() if now is None else now
        agent_id = str(observation["agent_id"])
        position = (float(observation["x"]), float(observation["y"]))
        width, height = float(observation["width"]), float(observation["height"])
        obstacles = observation["obstacles"]
        goal = observation.get("goal")
        reached = bool(observation.get("reached", False))

        nearby: list[dict[str, float]] = []
        for obstacle in obstacles:
            obstacle_position = (float(obstacle["x"]), float(obstacle["y"]))
            distance = self._distance(position, obstacle_position, width, height)
            if distance <= VISION_RADIUS_PX:
                nearby.append({"x": obstacle_position[0], "y": obstacle_position[1], "distance": round(distance, 1)})
        nearby.sort(key=lambda item: item["distance"])

        with self._lock:
            state = self._states.get(agent_id)
            if state is None:
                state = {
                    "position": position,
                    "last_progress": timestamp,
                    "goal_started": timestamp if goal is not None else None,
                    "frustration": 0,
                    "last_frustration_step": timestamp,
                    "state": "calm",
                }
                self._states[agent_id] = state

            previous = state["position"]
            assert isinstance(previous, tuple)
            moved = self._distance(position, previous, width, height)
            state["position"] = position
            near_obstacle = bool(nearby and nearby[0]["distance"] < 76)
            if moved >= 3:
                state["last_progress"] = timestamp
                if state["frustration"]:
                    state["frustration"] = max(0, int(state["frustration"]) - 1)
                    state["last_frustration_step"] = timestamp
            stuck_for = timestamp - float(state["last_progress"])
            goal_started = state["goal_started"]
            if goal is None or reached:
                state["goal_started"] = None
            elif goal_started is None:
                state["goal_started"] = timestamp
                goal_started = timestamp
            goal_failed = goal is not None and not reached and goal_started is not None and timestamp - float(goal_started) >= GOAL_TIMEOUT_SECONDS
            stuck = near_obstacle and stuck_for >= STUCK_AFTER_SECONDS
            cause = "stuck near an obstacle" if stuck else "goal not reached in time" if goal_failed else ""
            if cause and timestamp - float(state["last_frustration_step"]) >= STUCK_AFTER_SECONDS:
                state["frustration"] = min(3, int(state["frustration"]) + 1)
                state["last_frustration_step"] = timestamp
            if reached:
                state["frustration"] = 0
                state["last_frustration_step"] = timestamp
            frustration = int(state["frustration"])
            current_state = "frustrated" if frustration > 0 else "calm"
            state["state"] = current_state

        return {
            "agent_id": agent_id,
            "state": current_state,
            "frustration": frustration,
            "reason": cause,
            "nearby_obstacles": nearby,
            "nearest_obstacle": nearby[0] if nearby else None,
            "vision_radius_px": VISION_RADIUS_PX,
            "stuck_seconds": round(stuck_for, 1) if near_obstacle else 0,
            "goal_failed": bool(goal_failed),
        }


SIMULATION = SimulationMonitor()


def validate_observation(data: object) -> tuple[dict[str, object] | None, str | None]:
    """Validate and bound client-provided simulation telemetry before processing."""
    if not isinstance(data, dict):
        return None, "A JSON object is required."
    agent_id = data.get("agent_id")
    if not isinstance(agent_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,24}", agent_id):
        return None, "agent_id must be 1–24 letters, numbers, underscores, or hyphens."

    def number(value: object, name: str, low: float, high: float) -> tuple[float | None, str | None]:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            return None, f"{name} must be a finite number between {low:g} and {high:g}."
        return float(value), None

    position: dict[str, float] = {}
    for key in ("x", "y"):
        value, error = number(data.get(key), key, 0, 1)
        if error:
            return None, error
        position[key] = value
    dimensions: dict[str, float] = {}
    for key in ("width", "height"):
        value, error = number(data.get(key), key, 1, 10000)
        if error:
            return None, error
        dimensions[key] = value

    raw_obstacles = data.get("obstacles", [])
    if not isinstance(raw_obstacles, list) or len(raw_obstacles) > 50:
        return None, "obstacles must be an array with at most 50 entries."
    obstacles: list[dict[str, float]] = []
    for item in raw_obstacles:
        if not isinstance(item, dict):
            return None, "Each obstacle must contain normalized x and y coordinates."
        obstacle: dict[str, float] = {}
        for key in ("x", "y"):
            value, error = number(item.get(key), f"obstacle {key}", 0, 1)
            if error:
                return None, error
            obstacle[key] = value
        obstacles.append(obstacle)

    raw_goal = data.get("goal")
    goal: dict[str, float] | None = None
    if raw_goal is not None:
        if not isinstance(raw_goal, dict):
            return None, "goal must be null or contain normalized x and y coordinates."
        goal = {}
        for key in ("x", "y"):
            value, error = number(raw_goal.get(key), f"goal {key}", 0, 1)
            if error:
                return None, error
            goal[key] = value
    reached = data.get("reached", False)
    if not isinstance(reached, bool):
        return None, "reached must be a boolean."
    return {"agent_id": agent_id, **position, **dimensions, "obstacles": obstacles, "goal": goal, "reached": reached}, None


class SandboxHandler(BaseHTTPRequestHandler):
    server_version = "LocalAgentSandbox/0.2"

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json(200, {"ok": True, "agent": "local-demo", "api_keys_required": False})
            return
        filename = STATIC_FILES.get(path)
        if filename is None:
            self.send_error(404, "Not found")
            return
        try:
            body = (ROOT / filename).read_bytes()
        except OSError:
            self.send_error(404, "Not found")
            return
        content_type = "text/html; charset=utf-8" if filename.endswith(".html") else ("text/css; charset=utf-8" if filename.endswith(".css") else "text/javascript; charset=utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = urlparse(self.path).path
        if path not in ("/api/chat", "/api/simulation/observe"):
            self._send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid request length."})
            return
        if length < 1 or length > MAX_BODY_BYTES:
            self._send_json(413, {"error": "Request body must be under 16 KB."})
            return
        try:
            request = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"error": "Send a valid JSON request."})
            return
        if path == "/api/simulation/observe":
            observation, error = validate_observation(request)
            if error:
                self._send_json(400, {"error": error})
                return
            self._send_json(200, {"state_update": SIMULATION.observe(observation)})
            return
        if not isinstance(request, dict) or not isinstance(request.get("message"), str):
            self._send_json(400, {"error": "A string 'message' field is required."})
            return
        self._send_json(200, AGENT.handle(request["message"]))

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")


def main() -> None:
    host, port = "127.0.0.1", 8000
    server = ThreadingHTTPServer((host, port), SandboxHandler)
    print(f"AI Training Sandbox running at http://{host}:{port}")
    print("Press Ctrl+C to stop. No API keys or extra packages are needed.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local agent server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
