"""Agent 5 personality and behavior reference for AI Training Sandbox.

The live GitHub Pages simulation runs JavaScript in the browser. This Python
module is a standalone, standard-library reference implementation for Agent 5;
it is not imported by the browser. Keep its personality/decision rules aligned
with agent5.js when changing the character.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot, sin
from typing import Dict, Iterable, Tuple


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


@dataclass
class Agent5:
    """A capable, independent agent with a cheeky, stubborn personality."""

    x: float = 0.5
    y: float = 0.5
    confidence: float = 0.82
    independence: float = 0.90
    curiosity: float = 0.72
    cooperation: float = 0.58
    playfulness: float = 0.88
    stubbornness: float = 0.68
    happiness: float = 0.58
    frustration: float = 0.0
    sadness: float = 0.0
    relationships: Dict[int, float] = field(default_factory=dict)
    interaction_count: int = 0
    mood: str = "curious"

    @property
    def name(self) -> str:
        return "Agent 5"

    def react_to_reward(self) -> str:
        self.happiness = clamp(self.happiness + 0.16)
        self.frustration = clamp(self.frustration - 0.04)
        return "Obviously. I knew that was the right call."

    def react_to_setback(self) -> str:
        self.frustration = clamp(self.frustration + 0.18)
        self.curiosity = clamp(self.curiosity + 0.05)
        return "That obstacle is getting on my nerves. I'll find another way."

    def interact(self, other_id: int, friendly: bool = True) -> str:
        current = self.relationships.get(other_id, 0.0)
        self.relationships[other_id] = clamp(current + (0.08 if friendly else -0.04), -1.0, 1.0)
        self.interaction_count += 1
        if friendly:
            self.happiness = clamp(self.happiness + 0.05)
            return f"Agent 5 gives Agent {other_id} a smug little greeting."
        self.frustration = clamp(self.frustration + 0.04)
        return f"Agent 5 acts unimpressed with Agent {other_id}, but remembers it."

    def choose_detour(
        self,
        candidates: Iterable[Tuple[float, float]],
        goal: Tuple[float, float],
        obstacles: Iterable[Tuple[float, float]],
    ) -> Tuple[float, float]:
        """Choose a route balancing clearance and distance to the goal."""
        obstacle_points = tuple(obstacles)

        def score(point: Tuple[float, float]) -> float:
            clearance = min(
                (hypot(point[0] - ox, point[1] - oy) for ox, oy in obstacle_points),
                default=10_000.0,
            )
            distance = hypot(point[0] - goal[0], point[1] - goal[1])
            novelty = sin(point[0] * 17 + point[1] * 13) * self.curiosity * 0.05
            return clearance * 1.25 - distance * 0.22 + novelty

        choices = tuple(candidates)
        if not choices:
            raise ValueError("At least one detour candidate is required.")
        return max(choices, key=score)

    def update_mood(self, made_progress: bool, found_obstacle: bool = False) -> str:
        if made_progress:
            self.happiness = clamp(self.happiness + 0.03)
            self.frustration = clamp(self.frustration - 0.05)
        if found_obstacle:
            self.frustration = clamp(self.frustration + 0.04)
            self.curiosity = clamp(self.curiosity + 0.02)
        emotions = {
            "happy": self.happiness,
            "frustrated": self.frustration,
            "sad": self.sadness,
            "curious": self.curiosity,
        }
        strongest, value = max(emotions.items(), key=lambda item: item[1])
        self.mood = strongest if value > 0.58 else "content"
        return self.mood
