"""
What-If Simulation Service.

Allows users to simulate changes to tasks without persisting them,
showing the ripple effect on the project schedule.
"""

import uuid
from datetime import date, timedelta
from dataclasses import dataclass

import networkx as nx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import Task, Dependency
from app.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class TaskChange:
    """A hypothetical change to a task."""
    task_id: uuid.UUID
    start_date: date | None = None
    duration_days: int | None = None


@dataclass
class TaskImpact:
    """The impact of simulation on a single task."""
    task_id: uuid.UUID
    title: str
    original_start: date
    original_end: date
    simulated_start: date
    simulated_end: date
    delta_days: int  # Positive = delayed, negative = earlier


@dataclass
class SimulationResult:
    """Complete result of a what-if simulation."""
    project_id: uuid.UUID
    original_end_date: date
    simulated_end_date: date
    impact_days: int  # How many days the project end moved
    affected_tasks: list[TaskImpact]
    total_tasks: int


async def simulate_changes(
    session: AsyncSession,
    project_id: uuid.UUID,
    changes: list[TaskChange],
) -> SimulationResult:
    """
    Simulate changes to tasks and calculate the ripple effect.
    
    This runs the CPM forward pass in-memory without persisting any changes.
    
    Args:
        session: Database session
        project_id: The project to simulate
        changes: List of hypothetical task changes
        
    Returns:
        SimulationResult with original vs simulated dates
    """
    # Fetch all tasks for the project
    tasks_result = await session.execute(
        select(Task).where(Task.project_id == project_id)
    )
    tasks = list(tasks_result.scalars().all())
    
    if not tasks:
        raise ValueError(f"No tasks found for project {project_id}")
    
    # Fetch all dependencies
    task_ids = [t.id for t in tasks]
    deps_result = await session.execute(
        select(Dependency).where(
            Dependency.predecessor_id.in_(task_ids) &
            Dependency.successor_id.in_(task_ids)
        )
    )
    dependencies = list(deps_result.scalars().all())
    
    # Helper to calculate end_date
    def calc_end_date(start: date, duration: int) -> date:
        if duration == 0:
            return start
        return start + timedelta(days=duration - 1)
    
    # Build graph with original data
    graph = nx.DiGraph()
    for task in tasks:
        original_end = calc_end_date(task.start_date, task.duration_days)
        graph.add_node(
            task.id,
            title=task.title,
            duration_days=task.duration_days,
            start_date=task.start_date,
            original_start=task.start_date,
            original_end=original_end,
        )
    
    for dep in dependencies:
        graph.add_edge(dep.predecessor_id, dep.successor_id)
    
    # Apply hypothetical changes
    changes_map = {c.task_id: c for c in changes}
    for task_id, change in changes_map.items():
        if task_id not in graph.nodes:
            logger.warning(f"Task {task_id} not found in project, skipping")
            continue
        
        node = graph.nodes[task_id]
        if change.start_date is not None:
            node['start_date'] = change.start_date
        if change.duration_days is not None:
            node['duration_days'] = change.duration_days
    
    # Get topological order
    try:
        topo_order = list(nx.topological_sort(graph))
    except nx.NetworkXUnfeasible:
        raise ValueError("Graph contains a cycle")
    
    # Run CPM forward pass (same logic as recalc, but in-memory)
    for task_id in topo_order:
        node = graph.nodes[task_id]
        predecessors = list(graph.predecessors(task_id))
        
        if not predecessors:
            # Anchor task - use its (possibly modified) start_date
            start = node['start_date']
        else:
            # Calculate earliest valid start
            max_pred_end = max(
                graph.nodes[p]['end_date']
                for p in predecessors
            )
            earliest_start = max_pred_end + timedelta(days=1)
            
            # If this task was directly modified, use that date if valid
            # Otherwise, use constraint-based calculation
            if task_id in changes_map and changes_map[task_id].start_date is not None:
                # User explicitly set this date in simulation
                if changes_map[task_id].start_date >= earliest_start:
                    start = changes_map[task_id].start_date
                else:
                    start = earliest_start  # Can't violate constraint
            else:
                # Not directly modified - push forward if needed
                current = node['start_date']
                start = max(current, earliest_start)
        
        # Calculate end date
        duration = node['duration_days']
        if duration == 0:
            end = start
        else:
            end = start + timedelta(days=duration - 1)
        
        node['start_date'] = start
        node['end_date'] = end
    
    # Calculate original project end date
    original_end = max(
        graph.nodes[n]['original_end']
        for n in graph.nodes
    )
    
    # Calculate simulated project end date
    simulated_end = max(
        graph.nodes[n]['end_date']
        for n in graph.nodes
    )
    
    # Build impact list (only tasks that changed)
    affected_tasks = []
    for task_id in topo_order:
        node = graph.nodes[task_id]
        orig_start = node['original_start']
        orig_end = node['original_end']
        sim_start = node['start_date']
        sim_end = node['end_date']
        
        delta = (sim_end - orig_end).days
        
        if delta != 0:
            affected_tasks.append(TaskImpact(
                task_id=task_id,
                title=node['title'],
                original_start=orig_start,
                original_end=orig_end,
                simulated_start=sim_start,
                simulated_end=sim_end,
                delta_days=delta,
            ))
    
    return SimulationResult(
        project_id=project_id,
        original_end_date=original_end,
        simulated_end_date=simulated_end,
        impact_days=(simulated_end - original_end).days,
        affected_tasks=affected_tasks,
        total_tasks=len(tasks),
    )

