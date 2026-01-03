"""
Critical Path Method (CPM) implementation.

Calculates:
- Forward pass: Earliest Start (ES), Earliest Finish (EF)
- Backward pass: Latest Start (LS), Latest Finish (LF)
- Slack/Float: LS - ES (or LF - EF)
- Critical Path: Tasks where slack = 0
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
class TaskAnalysis:
    """Analysis results for a single task."""
    task_id: uuid.UUID
    title: str
    duration_days: int
    # Forward pass results
    earliest_start: date
    earliest_finish: date
    # Backward pass results  
    latest_start: date
    latest_finish: date
    # Slack
    total_slack: int  # Days of slack (0 = critical)
    is_critical: bool


@dataclass
class ProjectAnalysis:
    """Complete CPM analysis for a project."""
    project_id: uuid.UUID
    project_end_date: date  # Latest task finish
    task_analyses: list[TaskAnalysis]
    critical_path_task_ids: list[uuid.UUID]


async def analyze_critical_path(
    session: AsyncSession,
    project_id: uuid.UUID,
) -> ProjectAnalysis | None:
    """
    Perform complete CPM analysis on a project.
    
    Returns analysis including slack times and critical path identification.
    """
    # Fetch all tasks for the project
    tasks_result = await session.execute(
        select(Task).where(Task.project_id == project_id)
    )
    tasks = list(tasks_result.scalars().all())
    
    if not tasks:
        return None
    
    # Fetch all dependencies
    task_ids = [t.id for t in tasks]
    deps_result = await session.execute(
        select(Dependency).where(
            Dependency.predecessor_id.in_(task_ids) &
            Dependency.successor_id.in_(task_ids)
        )
    )
    dependencies = list(deps_result.scalars().all())
    
    # Build NetworkX graph
    graph = nx.DiGraph()
    
    for task in tasks:
        graph.add_node(
            task.id,
            title=task.title,
            duration_days=task.duration_days,
            start_date=task.start_date,
        )
    
    for dep in dependencies:
        graph.add_edge(dep.predecessor_id, dep.successor_id)
    
    # Perform CPM analysis
    return _calculate_cpm(graph, project_id)


def _calculate_cpm(graph: nx.DiGraph, project_id: uuid.UUID) -> ProjectAnalysis:
    """
    Calculate CPM forward and backward passes.
    
    Forward Pass: Calculate Earliest Start (ES) and Earliest Finish (EF)
    Backward Pass: Calculate Latest Start (LS) and Latest Finish (LF)
    """
    # Get topological order
    try:
        topo_order = list(nx.topological_sort(graph))
    except nx.NetworkXUnfeasible:
        logger.error("Cycle detected in graph")
        raise ValueError("Graph contains a cycle")
    
    # =========================================================================
    # Forward Pass: Calculate ES and EF
    # =========================================================================
    for node_id in topo_order:
        node = graph.nodes[node_id]
        predecessors = list(graph.predecessors(node_id))
        
        if not predecessors:
            # No predecessors - use the stored start_date
            es = node['start_date']
        else:
            # ES = max(EF of all predecessors) + 1 day
            max_pred_ef = max(graph.nodes[p]['ef'] for p in predecessors)
            es = max_pred_ef + timedelta(days=1)
        
        # EF = ES + duration - 1 (or ES if duration is 0)
        duration = node['duration_days']
        if duration == 0:
            ef = es
        else:
            ef = es + timedelta(days=duration - 1)
        
        node['es'] = es
        node['ef'] = ef
    
    # Find project end date (max EF across all tasks)
    project_end_date = max(graph.nodes[n]['ef'] for n in graph.nodes)
    
    # =========================================================================
    # Backward Pass: Calculate LF and LS
    # =========================================================================
    for node_id in reversed(topo_order):
        node = graph.nodes[node_id]
        successors = list(graph.successors(node_id))
        
        if not successors:
            # No successors - LF = project end date
            lf = project_end_date
        else:
            # LF = min(LS of all successors) - 1 day
            min_succ_ls = min(graph.nodes[s]['ls'] for s in successors)
            lf = min_succ_ls - timedelta(days=1)
        
        # LS = LF - duration + 1 (or LF if duration is 0)
        duration = node['duration_days']
        if duration == 0:
            ls = lf
        else:
            ls = lf - timedelta(days=duration - 1)
        
        node['lf'] = lf
        node['ls'] = ls
    
    # =========================================================================
    # Calculate Slack and Identify Critical Path
    # =========================================================================
    task_analyses = []
    critical_path_ids = []
    
    for node_id in topo_order:
        node = graph.nodes[node_id]
        
        # Total slack = LS - ES (in days)
        slack = (node['ls'] - node['es']).days
        is_critical = slack == 0
        
        if is_critical:
            critical_path_ids.append(node_id)
        
        task_analyses.append(TaskAnalysis(
            task_id=node_id,
            title=node['title'],
            duration_days=node['duration_days'],
            earliest_start=node['es'],
            earliest_finish=node['ef'],
            latest_start=node['ls'],
            latest_finish=node['lf'],
            total_slack=slack,
            is_critical=is_critical,
        ))
    
    return ProjectAnalysis(
        project_id=project_id,
        project_end_date=project_end_date,
        task_analyses=task_analyses,
        critical_path_task_ids=critical_path_ids,
    )

