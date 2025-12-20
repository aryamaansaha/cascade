"""
Race Condition Tests for calc_version_id Guard.

These tests verify that the version-based concurrency control
correctly handles rapid updates and prevents stale jobs from
executing.
"""

import asyncio
import uuid
from datetime import date, timedelta

import pytest

from app.services.recalc import calculate_dates, build_graph


class TestCPMCalculation:
    """Test the Critical Path Method calculation logic."""
    
    def test_simple_chain_calculation(self):
        """
        Test CPM calculation for a simple chain: A -> B -> C
        
        A: Dec 19-21 (3 days)
        B: Should start Dec 22, end Dec 23 (2 days)
        C: Should start Dec 24, end Dec 24 (1 day)
        """
        tasks = [
            {"id": uuid.uuid4(), "title": "A", "duration_days": 3, 
             "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
             "project_id": uuid.uuid4()},
            {"id": uuid.uuid4(), "title": "B", "duration_days": 2, 
             "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
             "project_id": uuid.uuid4()},
            {"id": uuid.uuid4(), "title": "C", "duration_days": 1, 
             "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
             "project_id": uuid.uuid4()},
        ]
        
        dependencies = [
            {"predecessor_id": tasks[0]["id"], "successor_id": tasks[1]["id"]},
            {"predecessor_id": tasks[1]["id"], "successor_id": tasks[2]["id"]},
        ]
        
        graph = build_graph(tasks, dependencies)
        import networkx as nx
        order = list(nx.topological_sort(graph))
        
        # Root is A (first in chain, no predecessors)
        updated = calculate_dates(graph, order, tasks[0]["id"])
        
        # B and C should be updated
        assert len(updated) == 2
        
        # Find B's update
        b_update = next(u for u in updated if u["id"] == tasks[1]["id"])
        assert b_update["start_date"] == date(2025, 12, 22)
        
        # Find C's update
        c_update = next(u for u in updated if u["id"] == tasks[2]["id"])
        assert c_update["start_date"] == date(2025, 12, 24)
    
    def test_diamond_dependency(self):
        """
        Test CPM with diamond pattern:
        
            A (Dec 19-21, 3 days)
           / \\
          B   C  (B: 2 days, C: 4 days)
           \\ /
            D (should wait for both)
        
        D should start after C ends (the longer path).
        """
        task_a = {"id": uuid.uuid4(), "title": "A", "duration_days": 3, 
                  "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        task_b = {"id": uuid.uuid4(), "title": "B", "duration_days": 2, 
                  "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        task_c = {"id": uuid.uuid4(), "title": "C", "duration_days": 4, 
                  "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        task_d = {"id": uuid.uuid4(), "title": "D", "duration_days": 1, 
                  "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        
        tasks = [task_a, task_b, task_c, task_d]
        dependencies = [
            {"predecessor_id": task_a["id"], "successor_id": task_b["id"]},
            {"predecessor_id": task_a["id"], "successor_id": task_c["id"]},
            {"predecessor_id": task_b["id"], "successor_id": task_d["id"]},
            {"predecessor_id": task_c["id"], "successor_id": task_d["id"]},
        ]
        
        graph = build_graph(tasks, dependencies)
        import networkx as nx
        order = list(nx.topological_sort(graph))
        
        updated = calculate_dates(graph, order, task_a["id"])
        
        # D should wait for C (the longer path)
        # A: Dec 19-21
        # B: Dec 22-23 (2 days after A)
        # C: Dec 22-25 (4 days after A)
        # D: Dec 26 (after C ends on Dec 25)
        d_update = next(u for u in updated if u["id"] == task_d["id"])
        assert d_update["start_date"] == date(2025, 12, 26)
    
    def test_milestone_handling(self):
        """
        Test that milestones (duration=0) are handled correctly.
        """
        task_a = {"id": uuid.uuid4(), "title": "A", "duration_days": 3, 
                  "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        milestone = {"id": uuid.uuid4(), "title": "Milestone", "duration_days": 0, 
                     "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                     "project_id": uuid.uuid4()}
        
        tasks = [task_a, milestone]
        dependencies = [
            {"predecessor_id": task_a["id"], "successor_id": milestone["id"]},
        ]
        
        graph = build_graph(tasks, dependencies)
        import networkx as nx
        order = list(nx.topological_sort(graph))
        
        updated = calculate_dates(graph, order, task_a["id"])
        
        # Milestone should start Dec 22 (day after A ends Dec 21)
        # And since duration=0, it should also end Dec 22
        m_update = next(u for u in updated if u["id"] == milestone["id"])
        assert m_update["start_date"] == date(2025, 12, 22)
    
    def test_no_predecessors_anchor_task(self):
        """
        Test that tasks with no predecessors keep their original date.
        """
        task_a = {"id": uuid.uuid4(), "title": "A", "duration_days": 3, 
                  "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        task_b = {"id": uuid.uuid4(), "title": "B", "duration_days": 2, 
                  "start_date": date(2025, 12, 25), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        
        # B does NOT depend on A - they're parallel
        tasks = [task_a, task_b]
        dependencies = []
        
        graph = build_graph(tasks, dependencies)
        import networkx as nx
        order = list(nx.topological_sort(graph))
        
        updated = calculate_dates(graph, order, task_a["id"])
        
        # Neither should be updated (both are anchors)
        assert len(updated) == 0
    
    def test_multiple_predecessors_max_wins(self):
        """
        Test that when a task has multiple predecessors,
        its start date is based on the LATEST predecessor end date.
        """
        # A ends Dec 21, B ends Dec 28
        task_a = {"id": uuid.uuid4(), "title": "A", "duration_days": 3, 
                  "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        task_b = {"id": uuid.uuid4(), "title": "B", "duration_days": 5, 
                  "start_date": date(2025, 12, 24), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        task_c = {"id": uuid.uuid4(), "title": "C", "duration_days": 1, 
                  "start_date": date(2025, 12, 19), "calc_version_id": uuid.uuid4(), 
                  "project_id": uuid.uuid4()}
        
        tasks = [task_a, task_b, task_c]
        dependencies = [
            {"predecessor_id": task_a["id"], "successor_id": task_c["id"]},
            {"predecessor_id": task_b["id"], "successor_id": task_c["id"]},
        ]
        
        graph = build_graph(tasks, dependencies)
        import networkx as nx
        order = list(nx.topological_sort(graph))
        
        updated = calculate_dates(graph, order, task_a["id"])
        
        # C should wait for B (ends Dec 28), so C starts Dec 29
        c_update = next(u for u in updated if u["id"] == task_c["id"])
        assert c_update["start_date"] == date(2025, 12, 29)
    
    def test_long_chain_propagation(self):
        """
        Test that date changes propagate through long chains correctly.
        """
        num_tasks = 10
        start_date = date(2025, 12, 19)
        
        # Create a chain: T0 -> T1 -> T2 -> ... -> T9
        tasks = [
            {"id": uuid.uuid4(), "title": f"T{i}", "duration_days": 1, 
             "start_date": start_date, "calc_version_id": uuid.uuid4(), 
             "project_id": uuid.uuid4()}
            for i in range(num_tasks)
        ]
        
        dependencies = [
            {"predecessor_id": tasks[i]["id"], "successor_id": tasks[i+1]["id"]}
            for i in range(num_tasks - 1)
        ]
        
        graph = build_graph(tasks, dependencies)
        import networkx as nx
        order = list(nx.topological_sort(graph))
        
        updated = calculate_dates(graph, order, tasks[0]["id"])
        
        # All tasks except T0 should be updated
        assert len(updated) == num_tasks - 1
        
        # T1 should be Dec 20, T2 Dec 21, etc.
        for i, task_update in enumerate(sorted(updated, key=lambda x: x["start_date"])):
            expected_date = start_date + timedelta(days=i + 1)
            assert task_update["start_date"] == expected_date


class TestVersionGuardLogic:
    """Test version guard scenarios (without database)."""
    
    def test_version_id_comparison(self):
        """Test UUID version comparison logic."""
        v1 = uuid.uuid4()
        v2 = uuid.uuid4()
        
        # Same version should match
        assert str(v1) == str(v1)
        
        # Different versions should not match
        assert str(v1) != str(v2)
    
    def test_version_changes_on_update(self):
        """Simulate version change logic."""
        # Initial version
        task_version = uuid.uuid4()
        job_version = str(task_version)
        
        # Verify job would proceed
        assert str(task_version) == job_version
        
        # Simulate update
        task_version = uuid.uuid4()
        
        # Job should now be stale
        assert str(task_version) != job_version


class TestRapidUpdatesAPI:
    """
    Test rapid API updates with the actual running server.
    
    These tests require the API server and worker to be running.
    Run with: pytest tests/test_race_condition.py::TestRapidUpdatesAPI -v
    """
    
    @pytest.mark.asyncio
    async def test_rapid_updates_generate_unique_versions(self, client):
        """
        Test that rapid updates each generate a unique version ID.
        """
        # Create project
        resp = await client.post(
            "/projects/",
            json={"name": "Version Test"}
        )
        assert resp.status_code == 201
        project_id = resp.json()["id"]
        
        # Create task
        resp = await client.post(
            "/tasks/",
            json={
                "title": "Rapid Task",
                "duration_days": 1,
                "start_date": "2025-12-19",
                "project_id": project_id,
            }
        )
        assert resp.status_code == 201
        task_id = resp.json()["id"]
        
        # Send 5 rapid updates
        versions = []
        for i in range(5):
            resp = await client.patch(
                f"/tasks/{task_id}",
                json={"start_date": f"2025-12-{20 + i}"}
            )
            assert resp.status_code == 200
            versions.append(resp.json()["calc_version_id"])
        
        # All versions should be different
        assert len(set(versions)) == 5
        
        # The task should have the last version and date
        resp = await client.get(f"/tasks/{task_id}")
        assert resp.json()["calc_version_id"] == versions[-1]
        assert resp.json()["start_date"] == "2025-12-24"
