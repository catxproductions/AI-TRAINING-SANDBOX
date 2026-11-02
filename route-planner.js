// Route recovery layer for the local sandbox simulation. This replaces the
// direct-goal steering with short-horizon obstacle sensing and temporary detours.
// Loaded after app.js so the existing animation loop calls this implementation.

const ROUTE_CLEARANCE = 54;
const ROUTE_LOOKAHEAD = 112;
const STUCK_REPLAN_MS = 1700;
const DETOUR_HOLD_MS = 1900;

function routePointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function routeObstaclesInPixels(bounds) {
  return worldObjects.filter((object) => object.type === "obstacle").map((object) => ({
    x: object.x * bounds.width,
    y: object.y * bounds.height,
    object,
  }));
}

function routeIsClear(from, to, obstacles, clearance = ROUTE_CLEARANCE) {
  return obstacles.every((obstacle) => routePointSegmentDistance(
    obstacle.x, obstacle.y, from.x, from.y, to.x, to.y,
  ) >= clearance);
}

function routeClampPoint(point, bounds, agent) {
  const marginX = agent.element.offsetWidth / 2 + 8;
  const marginY = agent.element.offsetHeight / 2 + 30;
  return {
    x: Math.max(marginX, Math.min(bounds.width - marginX, point.x)),
    y: Math.max(marginY, Math.min(bounds.height - marginY, point.y)),
  };
}

function routeChooseWaypoint(agent, position, goal, obstacles, bounds, now) {
  const goalVector = { x: goal.x - position.x, y: goal.y - position.y };
  const goalLength = Math.max(1, Math.hypot(goalVector.x, goalVector.y));
  const forward = { x: goalVector.x / goalLength, y: goalVector.y / goalLength };
  const blockers = obstacles
    .map((obstacle) => ({
      ...obstacle,
      distance: routePointSegmentDistance(obstacle.x, obstacle.y, position.x, position.y, goal.x, goal.y),
      along: ((obstacle.x - position.x) * forward.x + (obstacle.y - position.y) * forward.y),
    }))
    .filter((obstacle) => obstacle.along > 0 && obstacle.along < goalLength && obstacle.distance < ROUTE_CLEARANCE + 15)
    .sort((a, b) => a.along - b.along);

  const blocker = blockers[0];
  if (!blocker) return null;

  const side = agent.navigation.detourSign;
  const perpendicular = { x: -forward.y * side, y: forward.x * side };
  const candidates = [
    { x: blocker.x + forward.x * 64 + perpendicular.x * 78, y: blocker.y + forward.y * 64 + perpendicular.y * 78 },
    { x: blocker.x + forward.x * 64 - perpendicular.x * 78, y: blocker.y + forward.y * 64 - perpendicular.y * 78 },
    { x: blocker.x - forward.x * 55 + perpendicular.x * 92, y: blocker.y - forward.y * 55 + perpendicular.y * 92 },
    { x: blocker.x - forward.x * 55 - perpendicular.x * 92, y: blocker.y - forward.y * 55 - perpendicular.y * 92 },
  ].map((point) => routeClampPoint(point, bounds, agent));

  // Prefer a clear segment to the waypoint, then a clear onward route, then
  // whichever candidate makes the most goal progress. This naturally flips
  // to the other side when the first detour is blocked by another obstacle.
  const scored = candidates.map((point) => {
    const firstClear = routeIsClear(position, point, obstacles, ROUTE_CLEARANCE * .72);
    const onwardClear = routeIsClear(point, goal, obstacles, ROUTE_CLEARANCE * .72);
    const remaining = Math.hypot(goal.x - point.x, goal.y - point.y);
    return { point, score: (firstClear ? 180 : 0) + (onwardClear ? 95 : 0) - remaining * .16 - Math.hypot(point.x - position.x, point.y - position.y) * .08 };
  }).sort((a, b) => b.score - a.score);

  agent.navigation.detourUntil = now + DETOUR_HOLD_MS;
  agent.navigation.waypoint = scored[0].point;
  agent.navigation.detourObstacle = blocker.object;
  return agent.navigation.waypoint;
}

function seekAndAvoid(agent, time, deltaSeconds) {
  const settings = modeSettings[selectedMode];
  const bounds = arena.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;

  if (!agent.navigation) {
    agent.navigation = {
      lastX: agent.x * bounds.width,
      lastY: agent.y * bounds.height,
      lastProgressAt: time,
      bestGoalDistance: Infinity,
      detourUntil: 0,
      detourSign: agent.id % 2 ? 1 : -1,
      waypoint: null,
      detourObstacle: null,
      announcedDetour: false,
    };
  }
  const nav = agent.navigation;
  const position = { x: agent.x * bounds.width, y: agent.y * bounds.height };
  const obstacles = routeObstaclesInPixels(bounds);
  let goalObject = null;
  let goalPoint = null;
  let goalDistance = Infinity;

  for (const object of worldObjects) {
    if (object.type !== "goal" || object.completed) continue;
    const point = { x: object.x * bounds.width, y: object.y * bounds.height };
    const distance = Math.hypot(point.x - position.x, point.y - position.y);
    if (distance < goalDistance) {
      goalObject = object;
      goalPoint = point;
      goalDistance = distance;
    }
  }

  const moved = Math.hypot(position.x - nav.lastX, position.y - nav.lastY);
  if (moved > 1.2) {
    nav.lastProgressAt = time;
    nav.lastX = position.x;
    nav.lastY = position.y;
  }
  if (goalPoint && goalDistance < nav.bestGoalDistance - 4) {
    nav.bestGoalDistance = goalDistance;
    nav.lastProgressAt = time;
  }
  if (!goalPoint) nav.bestGoalDistance = Infinity;

  const stalled = goalPoint && time - nav.lastProgressAt > STUCK_REPLAN_MS;
  let waypoint = null;
  if (goalPoint) {
    const currentWaypoint = nav.waypoint;
    if (currentWaypoint && Math.hypot(currentWaypoint.x - position.x, currentWaypoint.y - position.y) > 24 && time < nav.detourUntil) {
      waypoint = currentWaypoint;
    } else {
      nav.waypoint = null;
      waypoint = routeChooseWaypoint(agent, position, goalPoint, obstacles, bounds, time);
    }

    if (stalled && !waypoint) {
      // If the direct approach is still unproductive, deliberately try the
      // opposite side on the next planning cycle instead of repeating it.
      nav.detourSign *= -1;
      nav.lastProgressAt = time;
      waypoint = routeChooseWaypoint(agent, position, goalPoint, obstacles, bounds, time);
    } else if (stalled && waypoint) {
      nav.detourSign *= -1;
      nav.lastProgressAt = time;
    }

    if (waypoint && !nav.announcedDetour) {
      nav.announcedDetour = true;
      addActivity(`Agent ${agent.id} found an alternate route around an obstacle`);
      feedback.textContent = `Agent ${agent.id} detected a blocked approach and is trying another route.`;
    } else if (!waypoint) {
      nav.announcedDetour = false;
    }

    if (goalDistance < 27 && time - agent.lastGoalAt > 800) {
      goalObject.completed = true;
      goalObject.element.classList.add("completed");
      agent.score += 3;
      agent.signal = Math.min(4, agent.signal + 1);
      agent.lastGoalAt = time;
      nav.waypoint = null;
      nav.announcedDetour = false;
      nav.bestGoalDistance = Infinity;
      addActivity(`Agent ${agent.id} reached a goal · score +3`);
      feedback.textContent = `Agent ${agent.id} reached the goal.`;
      updateWorldStatus();
      return;
    }
  } else {
    nav.waypoint = null;
    nav.announcedDetour = false;
  }

  const target = waypoint || goalPoint;
  let desiredX;
  let desiredY;
  if (target) {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    desiredX = dx / length;
    desiredY = dy / length;
  } else {
    desiredX = Math.cos(time * .00019 + agent.wander);
    desiredY = Math.sin(time * .00023 + agent.wander * .8);
  }

  // Repel away from obstacles in sensor range while the waypoint planner
  // handles the larger-scale decision of which side to pass around.
  for (const obstacle of obstacles) {
    const dx = position.x - obstacle.x;
    const dy = position.y - obstacle.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const visionRadius = 125;
    if (distance < visionRadius) {
      const force = (visionRadius - distance) / visionRadius * .72;
      desiredX += dx / distance * force;
      desiredY += dy / distance * force;
    }
  }

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
  agent.element.classList.toggle("is-detouring", Boolean(waypoint));
}

// Function declarations in the preceding classic script share the global
// environment, so the existing requestAnimationFrame loop now uses this planner.
