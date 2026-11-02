"""A tiny, API-key-free local agent with a strict, explicit tool allowlist."""

from __future__ import annotations

import ast
import json
import operator
import re
from pathlib import Path
from typing import Any

MAX_NOTE_LENGTH = 500


class SafeCalculator:
    """Evaluate a small arithmetic grammar without eval() or arbitrary code."""

    _binary = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
    }
    _unary = {ast.UAdd: operator.pos, ast.USub: operator.neg}

    @classmethod
    def calculate(cls, expression: str) -> float | int:
        if len(expression) > 120:
            raise ValueError("That calculation is too long.")
        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError as exc:
            raise ValueError("I couldn't read that arithmetic expression.") from exc
        result = cls._visit(tree.body)
        if isinstance(result, float) and (result != result or abs(result) == float("inf")):
            raise ValueError("That calculation is outside the supported range.")
        if abs(result) > 10**100:
            raise ValueError("That result is too large to display safely.")
        return result

    @classmethod
    def _visit(cls, node: ast.AST) -> float | int:
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            if abs(node.value) > 10**100:
                raise ValueError("That number is too large.")
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in cls._binary:
            left, right = cls._visit(node.left), cls._visit(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 10:
                raise ValueError("Exponents must be between -10 and 10.")
            try:
                return cls._binary[type(node.op)](left, right)
            except (ZeroDivisionError, OverflowError) as exc:
                raise ValueError("That calculation is undefined or too large.") from exc
        if isinstance(node, ast.UnaryOp) and type(node.op) in cls._unary:
            return cls._unary[type(node.op)](cls._visit(node.operand))
        raise ValueError("Only numbers and basic arithmetic operators are supported.")


class LocalAgent:
    """A deterministic agent loop: classify -> plan -> call one allowed tool -> respond."""

    def __init__(self, notes_path: Path | None = None) -> None:
        self.notes_path = notes_path or Path(__file__).with_name("notes.json")

    def handle(self, message: str) -> dict[str, str]:
        text = message.strip()
        if not text:
            return {"reply": "Send a message when you're ready.", "action": ""}
        if len(text) > 2000:
            return {"reply": "Please keep messages under 2,000 characters.", "action": ""}

        # Tool routing is explicit; unknown requests cannot trigger arbitrary actions.
        if self._is_note_request(text):
            return self._handle_note(text)
        if self._is_calculation(text):
            return self._handle_calculation(text)
        if self._is_planning_request(text):
            return self._handle_plan(text)
        if re.search(r"\b(hello|hi|hey)\b", text, re.IGNORECASE):
            return {
                "reply": "Hello! I can help plan a goal, calculate arithmetic, or save a note locally. Try one of the examples below.",
                "action": "",
            }
        return {
            "reply": (
                "I'm a small local demo, not a trained language model, so I don't have general-purpose reasoning or live information. "
                "I can still help by making a simple step-by-step plan, calculating arithmetic, or saving a note."
            ),
            "action": "",
        }

    @staticmethod
    def _is_note_request(text: str) -> bool:
        return bool(re.match(r"\s*(remember\b|note\s*:|save\s+note\b|show\s+notes\b|list\s+notes\b)", text, re.I))

    @staticmethod
    def _is_calculation(text: str) -> bool:
        return bool(re.search(r"\b(calculate|what is|what's|compute)\b", text, re.I)) and bool(re.search(r"\d", text))

    @staticmethod
    def _is_planning_request(text: str) -> bool:
        return bool(re.search(r"\b(plan|make a plan|break down|steps for)\b", text, re.I))

    def _read_notes(self) -> list[str]:
        try:
            data = json.loads(self.notes_path.read_text(encoding="utf-8"))
            return [note for note in data if isinstance(note, str)][-50:]
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return []

    def _handle_note(self, text: str) -> dict[str, str]:
        if re.match(r"\s*(show\s+notes|list\s+notes)\b", text, re.I):
            notes = self._read_notes()
            if not notes:
                return {"reply": "There are no saved notes yet. Try: “Remember that my project is called Atlas.”", "action": ""}
            return {"reply": "Here are your local notes:\n" + "\n".join(f"• {note}" for note in notes), "action": "Read saved notes"}

        match = re.match(r"\s*(?:remember\s+that\s+|remember\s+|note\s*:\s*|save\s+note\s*:\s*)(.+)", text, re.I | re.S)
        note = (match.group(1).strip() if match else "")
        if not note:
            return {"reply": "Tell me what to remember, for example: “Remember that my project is called Atlas.”", "action": ""}
        if len(note) > MAX_NOTE_LENGTH:
            return {"reply": f"Please keep each note under {MAX_NOTE_LENGTH} characters.", "action": ""}
        notes = self._read_notes()
        notes.append(note)
        self.notes_path.parent.mkdir(parents=True, exist_ok=True)
        self.notes_path.write_text(json.dumps(notes[-50:], indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return {"reply": f"Saved locally: “{note}”", "action": "Saved a local note"}

    @staticmethod
    def _handle_calculation(text: str) -> dict[str, str]:
        expression = re.sub(r"^.*?\b(?:calculate|compute|what is|what's)\b", "", text, count=1, flags=re.I).strip().rstrip("?.! ")
        if not expression:
            return {"reply": "Give me an arithmetic expression, such as “Calculate (18 * 7) + 12.”", "action": ""}
        try:
            result = SafeCalculator.calculate(expression)
        except (ValueError, TypeError) as exc:
            return {"reply": str(exc), "action": ""}
        return {"reply": f"{expression} = {result}", "action": f"Calculated {expression} = {result}"}

    @staticmethod
    def _handle_plan(text: str) -> dict[str, str]:
        match = re.search(r"\b(?:plan|make a plan for|break down|steps for)\b\s*(.*)", text, re.I)
        goal = (match.group(1).strip(" :?.") if match else "your goal") or "your goal"
        steps = [
            f"Define what “{goal}” means and choose a clear done condition.",
            "Break the work into small tasks that each take less than an hour.",
            "Do the first task, then review what changed and adjust the next step.",
        ]
        return {"reply": "Here’s a starting plan:\n" + "\n".join(f"{i}. {step}" for i, step in enumerate(steps, 1)), "action": "Drafted a 3-step plan"}


def main() -> None:
    """Small manual smoke test: python agent.py 'Calculate 2 + 2'."""
    import sys

    agent = LocalAgent()
    print(agent.handle(" ".join(sys.argv[1:]) or "hi")["reply"])


if __name__ == "__main__":
    main()
