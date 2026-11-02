import unittest

from server import SimulationMonitor, validate_observation


class SimulationVisionTests(unittest.TestCase):
    def setUp(self):
        self.monitor = SimulationMonitor()

    def test_detects_nearby_obstacle_and_omits_distant_one(self):
        result = self.monitor.observe({
            "agent_id": "1", "x": 0.5, "y": 0.5, "width": 500, "height": 300,
            "obstacles": [{"x": 0.55, "y": 0.5}, {"x": 0.95, "y": 0.9}], "goal": None,
        }, now=10)
        self.assertEqual(len(result["nearby_obstacles"]), 1)
        self.assertAlmostEqual(result["nearest_obstacle"]["distance"], 25)
        self.assertEqual(result["state"], "calm")

    def test_stuck_near_obstacle_transitions_to_frustrated(self):
        observation = {
            "agent_id": "2", "x": 0.5, "y": 0.5, "width": 500, "height": 300,
            "obstacles": [{"x": 0.55, "y": 0.5}], "goal": None,
        }
        self.monitor.observe(observation, now=0)
        result = self.monitor.observe(observation, now=7)
        self.assertEqual(result["state"], "frustrated")
        self.assertEqual(result["reason"], "stuck near an obstacle")
        self.assertGreaterEqual(result["frustration"], 1)

    def test_goal_timeout_causes_frustration(self):
        observation = {
            "agent_id": "3", "x": 0.1, "y": 0.1, "width": 400, "height": 300,
            "obstacles": [], "goal": {"x": 0.9, "y": 0.9},
        }
        self.monitor.observe(observation, now=0)
        result = self.monitor.observe(observation, now=31)
        self.assertEqual(result["state"], "frustrated")
        self.assertEqual(result["reason"], "goal not reached in time")
        self.assertTrue(result["goal_failed"])

    def test_reaching_goal_clears_frustration(self):
        observation = {
            "agent_id": "4", "x": 0.5, "y": 0.5, "width": 500, "height": 300,
            "obstacles": [{"x": 0.55, "y": 0.5}], "goal": {"x": 0.8, "y": 0.8},
        }
        self.monitor.observe(observation, now=0)
        self.monitor.observe(observation, now=10)
        result = self.monitor.observe({**observation, "goal": None, "reached": True}, now=11)
        self.assertEqual(result["state"], "calm")
        self.assertEqual(result["frustration"], 0)

    def test_rejects_invalid_or_unbounded_observations(self):
        invalid = validate_observation({"agent_id": "bad id", "x": 0.5, "y": 0.5, "width": 100, "height": 100})
        self.assertIsNotNone(invalid[1])
        oversized = validate_observation({"agent_id": "1", "x": 0.5, "y": 0.5, "width": 100, "height": 100, "obstacles": [{"x": 0.5, "y": 0.5}] * 51})
        self.assertIsNotNone(oversized[1])


if __name__ == "__main__":
    unittest.main()
