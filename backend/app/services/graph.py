"""
Graph operations using NetworkX.

This module handles:
- Cycle detection for dependency validation
- (Future) Subgraph retrieval and date propagation
"""

import uuid
import networkx as nx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import Task, Dependency


async def build_project_graph(
    session: AsyncSession,
    project_id: uuid.UUID,
) -> nx.DiGraph:
    """
    Build a NetworkX DiGraph from all tasks and dependencies in a project.
    
    Returns a graph where:
    - Nodes are task IDs
    - Edges go from predecessor -> successor
    """
    # Fetch all tasks in the project
    tasks_query = select(Task).where(Task.project_id == project_id)
    tasks_result = await session.execute(tasks_query)
    tasks = tasks_result.scalars().all()
    
    # Fetch all dependencies for tasks in this project
    task_ids = [task.id for task in tasks]
    deps_query = select(Dependency).where(
        Dependency.predecessor_id.in_(task_ids)
    )
    deps_result = await session.execute(deps_query)
    dependencies = deps_result.scalars().all()
    
    # Build the graph
    graph = nx.DiGraph()
    
    # Add nodes
    for task in tasks:
        graph.add_node(task.id, task=task)
    
    # Add edges
    for dep in dependencies:
        graph.add_edge(dep.predecessor_id, dep.successor_id)
    
    return graph


async def detect_cycle(
    session: AsyncSession,
    project_id: uuid.UUID,
    new_predecessor_id: uuid.UUID,
    new_successor_id: uuid.UUID,
) -> bool:
    """
    Check if adding an edge (predecessor -> successor) would create a cycle.
    
    Algorithm:
    1. Build the existing graph for the project
    2. Temporarily add the new edge
    3. Check for cycles using NetworkX
    
    Returns True if a cycle would be created, False otherwise.
    """
    # Build current graph
    graph = await build_project_graph(session, project_id)
    
    # Add the proposed edge
    graph.add_edge(new_predecessor_id, new_successor_id)
    
    # Check for cycles
    try:
        nx.find_cycle(graph)
        return True  # Cycle found
    except nx.NetworkXNoCycle:
        return False  # No cycle


async def get_descendants(
    session: AsyncSession,
    root_task_id: uuid.UUID,
    project_id: uuid.UUID,
) -> list[uuid.UUID]:
    """
    Get all descendant task IDs of a given root task.
    
    Uses NetworkX to traverse the DAG from the root node.
    
    Returns list of task IDs that are downstream of the root.
    """
    graph = await build_project_graph(session, project_id)
    
    if root_task_id not in graph:
        return []
    
    # Get all descendants (nodes reachable from root)
    descendants = nx.descendants(graph, root_task_id)
    return list(descendants)


def topological_sort(graph: nx.DiGraph) -> list[uuid.UUID]:
    """
    Perform topological sort on the graph.
    
    Returns tasks in order such that for every edge (u, v),
    u comes before v in the ordering.
    
    This determines the order in which to calculate dates.
    """
    return list(nx.topological_sort(graph))

