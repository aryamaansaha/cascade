"""
Recalculation service for propagating date changes through the task DAG.

This implements the Critical Path Method (CPM) forward pass:
- When a task's dates change, all downstream tasks must be recalculated
- Successor.Start = Max(Predecessor.End) + 1 day
- Uses topological sort to ensure correct calculation order
"""

import uuid
from datetime import date, timedelta
from typing import Any

import networkx as nx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_context
from app.models import Task


async def recalc_subtree(ctx: dict, root_task_id: str, version_id: str) -> str:
    """
    ARQ job: Recalculate dates for all tasks downstream of root_task.
    
    Args:
        ctx: ARQ context
        root_task_id: The task that was modified (anchor point)
        version_id: The calc_version_id at time of modification
        
    Returns:
        Status message
    """
    root_id = uuid.UUID(root_task_id)
    
    async with get_session_context() as session:
        # Step 1: Guard clause - check if this job is stale
        root_task = await session.get(Task, root_id)
        if root_task is None:
            return f"Task {root_task_id} not found - may have been deleted"
        
        if str(root_task.calc_version_id) != version_id:
            return f"Stale job: version mismatch (expected {version_id}, got {root_task.calc_version_id})"
        
        # Step 2: Fetch subgraph using recursive CTE
        tasks, dependencies = await fetch_subgraph(session, root_id, root_task.project_id)
        
        if not tasks:
            return "No tasks to recalculate"
        
        # Step 3: Build NetworkX graph and perform topological sort
        graph = build_graph(tasks, dependencies)
        
        try:
            calculation_order = list(nx.topological_sort(graph))
        except nx.NetworkXUnfeasible:
            return "Error: Cycle detected in task graph"
        
        # Step 4: Calculate dates using CPM forward pass
        updated_tasks = calculate_dates(graph, calculation_order, root_id)
        
        if not updated_tasks:
            return "No date changes needed"
        
        # Step 5: Bulk update tasks
        await bulk_update_dates(session, updated_tasks)
        
        return f"Updated {len(updated_tasks)} tasks"


async def fetch_subgraph(
    session: AsyncSession,
    root_task_id: uuid.UUID,
    project_id: uuid.UUID,
) -> tuple[list[dict], list[dict]]:
    """
    Fetch all tasks and dependencies in the subgraph for recalculation.
    
    This fetches:
    1. The root task
    2. All tasks downstream of the root (successors recursively)
    3. All direct predecessors of tasks in the subgraph (needed for date calculation)
    
    Uses a recursive CTE for efficient single-query retrieval.
    
    Returns:
        Tuple of (tasks, dependencies) as dictionaries
    """
    # First, get the root task and all its descendants
    # Then also fetch the immediate predecessors of any task in the subgraph
    # This ensures we have all the data needed to calculate dates
    subgraph_query = text("""
        WITH RECURSIVE downstream AS (
            -- Base case: the root task
            SELECT CAST(:root_id AS uuid) AS task_id
            
            UNION
            
            -- Recursive case: all successors
            SELECT d.successor_id AS task_id
            FROM dependencies d
            INNER JOIN downstream ds ON d.predecessor_id = ds.task_id
        ),
        -- Also include direct predecessors of tasks in the downstream set
        all_relevant AS (
            SELECT task_id FROM downstream
            UNION
            SELECT d.predecessor_id AS task_id
            FROM dependencies d
            WHERE d.successor_id IN (SELECT task_id FROM downstream)
        )
        SELECT 
            t.id,
            t.title,
            t.duration_days,
            t.start_date,
            t.calc_version_id,
            t.project_id
        FROM tasks t
        WHERE t.id IN (SELECT task_id FROM all_relevant)
          AND t.project_id = CAST(:project_id AS uuid)
    """)
    
    tasks_result = await session.execute(
        subgraph_query,
        {"root_id": str(root_task_id), "project_id": str(project_id)}
    )
    tasks = [dict(row._mapping) for row in tasks_result.fetchall()]
    
    # Fetch all dependencies within this subgraph
    task_ids = [t["id"] for t in tasks]
    if not task_ids:
        return [], []
    
    # Convert UUIDs to strings for the array parameter
    task_ids_str = [str(tid) for tid in task_ids]
    
    deps_query = text("""
        SELECT predecessor_id, successor_id
        FROM dependencies
        WHERE predecessor_id = ANY(CAST(:task_ids AS uuid[]))
          AND successor_id = ANY(CAST(:task_ids AS uuid[]))
    """)
    
    deps_result = await session.execute(
        deps_query,
        {"task_ids": task_ids_str}
    )
    dependencies = [dict(row._mapping) for row in deps_result.fetchall()]
    
    return tasks, dependencies


def build_graph(
    tasks: list[dict],
    dependencies: list[dict],
) -> nx.DiGraph:
    """
    Build a NetworkX DiGraph from tasks and dependencies.
    
    Nodes store task data for easy access during calculation.
    """
    graph = nx.DiGraph()
    
    # Add nodes with task data
    for task in tasks:
        graph.add_node(
            task["id"],
            title=task["title"],
            duration_days=task["duration_days"],
            start_date=task["start_date"],
            original_start_date=task["start_date"],  # Track original for comparison
        )
    
    # Add edges
    for dep in dependencies:
        graph.add_edge(dep["predecessor_id"], dep["successor_id"])
    
    return graph


def calculate_dates(
    graph: nx.DiGraph,
    calculation_order: list[uuid.UUID],
    root_task_id: uuid.UUID,
) -> list[dict]:
    """
    Calculate new start dates using Critical Path Method (forward pass).
    
    Formula: Successor.Start = Max(Predecessor.End) + 1
    Where: Predecessor.End = Predecessor.Start + Predecessor.Duration - 1
    
    Key logic:
    - Tasks with NO predecessors are "anchors" - their dates are user-controlled
    - Tasks WITH predecessors have their dates calculated from predecessor end dates
    - The root_task_id helps us trace what triggered the recalc, but doesn't
      exempt a task from recalculation if it has predecessors
    
    Args:
        graph: NetworkX DiGraph with task data on nodes
        calculation_order: Topologically sorted task IDs
        root_task_id: The task that triggered this recalc (for logging/debugging)
        
    Returns:
        List of tasks with updated start_dates
    """
    updated_tasks = []
    
    for task_id in calculation_order:
        node_data = graph.nodes[task_id]
        predecessors = list(graph.predecessors(task_id))
        
        if not predecessors:
            # No predecessors - this is an anchor/root task
            # Keep its user-set date, just calculate end_date for successors
            start = node_data["start_date"]
            duration = node_data["duration_days"]
            if duration == 0:
                node_data["end_date"] = start
            else:
                node_data["end_date"] = start + timedelta(days=duration - 1)
            continue
        
        # Task has predecessors - calculate its start date from them
        # Start = Max(Predecessor.End) + 1 day
        max_predecessor_end = max(
            graph.nodes[pred_id]["end_date"]
            for pred_id in predecessors
        )
        
        # New start is the day after the latest predecessor ends
        new_start = max_predecessor_end + timedelta(days=1)
        
        # Calculate this task's end date
        duration = node_data["duration_days"]
        if duration == 0:
            new_end = new_start
        else:
            new_end = new_start + timedelta(days=duration - 1)
        
        # Update node data for downstream calculations
        node_data["start_date"] = new_start
        node_data["end_date"] = new_end
        
        # Track if date actually changed
        if new_start != node_data["original_start_date"]:
            updated_tasks.append({
                "id": task_id,
                "start_date": new_start,
            })
    
    return updated_tasks


async def bulk_update_dates(
    session: AsyncSession,
    updated_tasks: list[dict],
) -> None:
    """
    Bulk update task start_dates in the database.
    
    Uses ORM-style updates for each task. While not as efficient as a single
    bulk UPDATE, this works reliably with asyncpg.
    """
    if not updated_tasks:
        return
    
    from datetime import datetime
    
    for task_update in updated_tasks:
        task = await session.get(Task, task_update["id"])
        if task:
            task.start_date = task_update["start_date"]
            task.updated_at = datetime.utcnow()
            session.add(task)

