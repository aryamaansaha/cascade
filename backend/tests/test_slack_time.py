"""
Test slack time behavior - users can set dates with buffer/slack
as long as they don't violate dependency constraints.
"""

import pytest
from datetime import date, timedelta
import asyncio

from app.services.recalc import calculate_dates, build_graph
import networkx as nx
import uuid


class TestSlackTime:
    """Test that slack time is preserved when valid."""

    def test_slack_time_preserved_when_valid(self):
        """
        Scenario: A (ends Jan 5) -> B (user sets to Jan 20)
        Expected: B stays at Jan 20 (valid slack)
        """
        # Create tasks
        task_a_id = uuid.uuid4()
        task_b_id = uuid.uuid4()
        
        tasks = [
            {
                "id": task_a_id,
                "title": "Task A",
                "duration_days": 5,
                "start_date": date(2026, 1, 1),  # Jan 1-5
            },
            {
                "id": task_b_id,
                "title": "Task B", 
                "duration_days": 3,
                "start_date": date(2026, 1, 20),  # User set to Jan 20 (with slack)
            },
        ]
        
        dependencies = [
            {"predecessor_id": task_a_id, "successor_id": task_b_id}
        ]
        
        # Build graph and calculate
        graph = build_graph(tasks, dependencies)
        order = list(nx.topological_sort(graph))
        updated = calculate_dates(graph, order, task_a_id)
        
        # B should NOT be updated - its Jan 20 date is valid (after A ends Jan 5)
        assert len(updated) == 0, f"Expected no updates, got {updated}"
        
        # Verify B's date is still Jan 20
        assert graph.nodes[task_b_id]["start_date"] == date(2026, 1, 20)
        
    def test_constraint_violation_pushes_forward(self):
        """
        Scenario: A (ends Jan 25) -> B (user set to Jan 10)
        Expected: B gets pushed to Jan 26 (constraint violated)
        """
        task_a_id = uuid.uuid4()
        task_b_id = uuid.uuid4()
        
        tasks = [
            {
                "id": task_a_id,
                "title": "Task A",
                "duration_days": 5,
                "start_date": date(2026, 1, 21),  # Jan 21-25
            },
            {
                "id": task_b_id,
                "title": "Task B",
                "duration_days": 3,
                "start_date": date(2026, 1, 10),  # Invalid! Before A ends
            },
        ]
        
        dependencies = [
            {"predecessor_id": task_a_id, "successor_id": task_b_id}
        ]
        
        graph = build_graph(tasks, dependencies)
        order = list(nx.topological_sort(graph))
        updated = calculate_dates(graph, order, task_a_id)
        
        # B should be pushed to Jan 26 (A ends Jan 25 + 1)
        assert len(updated) == 1
        assert updated[0]["id"] == task_b_id
        assert updated[0]["start_date"] == date(2026, 1, 26)
        
    def test_cascade_with_slack(self):
        """
        Scenario: A -> B -> C, user moves B later
        B has slack, C should cascade from B's new date
        """
        task_a_id = uuid.uuid4()
        task_b_id = uuid.uuid4()
        task_c_id = uuid.uuid4()
        
        tasks = [
            {
                "id": task_a_id,
                "title": "Task A",
                "duration_days": 5,
                "start_date": date(2026, 1, 1),  # Jan 1-5
            },
            {
                "id": task_b_id,
                "title": "Task B",
                "duration_days": 3,
                "start_date": date(2026, 1, 20),  # User added slack: Jan 20-22
            },
            {
                "id": task_c_id,
                "title": "Task C",
                "duration_days": 2,
                "start_date": date(2026, 1, 9),  # Old date, now invalid
            },
        ]
        
        dependencies = [
            {"predecessor_id": task_a_id, "successor_id": task_b_id},
            {"predecessor_id": task_b_id, "successor_id": task_c_id},
        ]
        
        graph = build_graph(tasks, dependencies)
        order = list(nx.topological_sort(graph))
        updated = calculate_dates(graph, order, task_a_id)
        
        # B should stay at Jan 20 (valid slack)
        # C should be pushed to Jan 23 (B ends Jan 22 + 1)
        assert len(updated) == 1  # Only C is updated
        assert updated[0]["id"] == task_c_id
        assert updated[0]["start_date"] == date(2026, 1, 23)
        
    def test_immediate_schedule_still_works(self):
        """
        Scenario: A -> B where B is set to earliest valid date
        Expected: No change needed
        """
        task_a_id = uuid.uuid4()
        task_b_id = uuid.uuid4()
        
        tasks = [
            {
                "id": task_a_id,
                "title": "Task A",
                "duration_days": 5,
                "start_date": date(2026, 1, 1),  # Jan 1-5
            },
            {
                "id": task_b_id,
                "title": "Task B",
                "duration_days": 3,
                "start_date": date(2026, 1, 6),  # Exactly at earliest valid
            },
        ]
        
        dependencies = [
            {"predecessor_id": task_a_id, "successor_id": task_b_id}
        ]
        
        graph = build_graph(tasks, dependencies)
        order = list(nx.topological_sort(graph))
        updated = calculate_dates(graph, order, task_a_id)
        
        # No updates needed - B is already at earliest valid
        assert len(updated) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

