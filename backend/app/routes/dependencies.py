"""
Dependency routes for the Cascade API.
"""

import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import Task, Dependency
from app.schemas import DependencyCreate, DependencyRead
from app.services.graph import detect_cycle
from app.worker import enqueue_recalc
from app.exceptions import (
    NotFoundError,
    CycleDetectedError,
    DuplicateDependencyError,
    SelfDependencyError,
    CrossProjectDependencyError,
)
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.post("/", response_model=DependencyRead, status_code=status.HTTP_201_CREATED)
async def create_dependency(
    dep_in: DependencyCreate,
    session: AsyncSession = Depends(get_session),
) -> Dependency:
    """
    Create a new dependency (edge in the task DAG).
    
    Performs cycle detection before creating the dependency.
    If adding this edge would create a cycle, returns 400 Bad Request.
    """
    logger.info(f"Creating dependency: {dep_in.predecessor_id} -> {dep_in.successor_id}")
    
    # Validate both tasks exist and are in the same project
    predecessor = await session.get(Task, dep_in.predecessor_id)
    successor = await session.get(Task, dep_in.successor_id)
    
    if not predecessor:
        raise NotFoundError("Predecessor task", str(dep_in.predecessor_id))
    
    if not successor:
        raise NotFoundError("Successor task", str(dep_in.successor_id))
    
    # Ensure tasks are in the same project
    if predecessor.project_id != successor.project_id:
        logger.warning(
            f"Cross-project dependency rejected: "
            f"{predecessor.project_id} -> {successor.project_id}"
        )
        raise CrossProjectDependencyError(
            str(predecessor.project_id),
            str(successor.project_id),
        )
    
    # Check if dependency already exists
    existing = await session.get(
        Dependency, 
        (dep_in.predecessor_id, dep_in.successor_id)
    )
    if existing:
        logger.warning(f"Duplicate dependency rejected: {dep_in.predecessor_id} -> {dep_in.successor_id}")
        raise DuplicateDependencyError(
            str(dep_in.predecessor_id),
            str(dep_in.successor_id),
        )
    
    # Prevent self-loops
    if dep_in.predecessor_id == dep_in.successor_id:
        logger.warning(f"Self-dependency rejected: {dep_in.predecessor_id}")
        raise SelfDependencyError(str(dep_in.predecessor_id))
    
    # Cycle detection
    logger.debug(f"Running cycle detection for {dep_in.predecessor_id} -> {dep_in.successor_id}")
    has_cycle = await detect_cycle(
        session,
        predecessor.project_id,
        dep_in.predecessor_id,
        dep_in.successor_id,
    )
    
    if has_cycle:
        logger.warning(
            f"Cycle detected: {dep_in.predecessor_id} -> {dep_in.successor_id} "
            f"would create a cycle"
        )
        raise CycleDetectedError(
            str(dep_in.predecessor_id),
            str(dep_in.successor_id),
        )
    
    # Create the dependency
    dependency = Dependency(
        predecessor_id=dep_in.predecessor_id,
        successor_id=dep_in.successor_id,
    )
    session.add(dependency)
    await session.flush()
    await session.refresh(dependency)
    
    logger.info(
        f"Created dependency: {predecessor.title} -> {successor.title} "
        f"(project={predecessor.project_id})"
    )
    
    # Update successor's version and trigger recalc
    # The new dependency may push the successor's start date later
    new_version_id = uuid.uuid4()
    successor.calc_version_id = new_version_id
    await session.flush()
    await enqueue_recalc(str(successor.id), str(new_version_id))
    
    return dependency


@router.get("/", response_model=list[DependencyRead])
async def list_dependencies(
    project_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[Dependency]:
    """
    List dependencies.
    
    Optionally filter by:
    - project_id: Get all dependencies within a project
    - task_id: Get dependencies where task is predecessor OR successor
    """
    if project_id:
        # Get all dependencies for tasks in this project
        task_ids_query = select(Task.id).where(Task.project_id == project_id)
        task_ids_result = await session.execute(task_ids_query)
        task_ids = [row[0] for row in task_ids_result.all()]
        
        query = select(Dependency).where(
            Dependency.predecessor_id.in_(task_ids)
        )
    elif task_id:
        # Get dependencies involving this specific task
        query = select(Dependency).where(
            (Dependency.predecessor_id == task_id) | 
            (Dependency.successor_id == task_id)
        )
    else:
        query = select(Dependency)
    
    result = await session.execute(query)
    dependencies = list(result.scalars().all())
    
    logger.debug(f"Listed {len(dependencies)} dependencies")
    
    return dependencies


@router.delete(
    "/{predecessor_id}/{successor_id}", 
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_dependency(
    predecessor_id: uuid.UUID,
    successor_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a dependency.
    
    This may allow the successor task to start earlier,
    triggering a recalculation.
    """
    dependency = await session.get(Dependency, (predecessor_id, successor_id))
    if not dependency:
        raise NotFoundError("Dependency", f"{predecessor_id}/{successor_id}")
    
    logger.info(f"Deleting dependency: {predecessor_id} -> {successor_id}")
    
    # Get the successor task before deleting dependency
    successor = await session.get(Task, successor_id)
    
    await session.delete(dependency)
    await session.flush()
    
    # Trigger recalc on the successor - it may now start earlier
    if successor:
        new_version_id = uuid.uuid4()
        successor.calc_version_id = new_version_id
        await session.flush()
        await enqueue_recalc(str(successor_id), str(new_version_id))
