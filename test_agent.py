import tempfile
import unittest
from pathlib import Path

from agent import LocalAgent, SafeCalculator


class SafeCalculatorTests(unittest.TestCase):
    def test_arithmetic(self):
        self.assertEqual(SafeCalculator.calculate("(18 * 7) + 12"), 138)
        self.assertEqual(SafeCalculator.calculate("-4 ** 2"), -16)

    def test_rejects_code_and_names(self):
        for expression in ("__import__('os')", "1 + open('file')", "x + 1"):
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                SafeCalculator.calculate(expression)

    def test_rejects_large_exponent(self):
        with self.assertRaises(ValueError):
            SafeCalculator.calculate("2 ** 1000")


class LocalAgentTests(unittest.TestCase):
    def test_calculates(self):
        response = LocalAgent().handle("Calculate (18 * 7) + 12")
        self.assertIn("= 138", response["reply"])
        self.assertTrue(response["action"])

    def test_plans(self):
        response = LocalAgent().handle("Plan a simple personal website")
        self.assertIn("3-step plan", response["action"])
        self.assertIn("personal website", response["reply"])

    def test_notes_are_persisted_to_configured_path(self):
        with tempfile.TemporaryDirectory() as directory:
            agent = LocalAgent(Path(directory) / "notes.json")
            self.assertIn("Saved locally", agent.handle("Remember that my project is Atlas")["reply"])
            self.assertIn("Atlas", agent.handle("Show notes")["reply"])

    def test_unknown_task_is_honest(self):
        response = LocalAgent().handle("What is the weather tomorrow?")
        self.assertIn("not a trained language model", response["reply"])


if __name__ == "__main__":
    unittest.main()
