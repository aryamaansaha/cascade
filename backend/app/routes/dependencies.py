import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import Task, Dependency
from app.schemas import DependencyCreate, DependencyRead
from app.services.graph import detect_cycle
from app.worker import enqueue_recalc

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
    # Validate both tasks exist and are in the same project
    predecessor = await session.get(Task, dep_in.predecessor_id)
    successor = await session.get(Task, dep_in.successor_id)
    
    if not predecessor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Predecessor task {dep_in.predecessor_id} not found",
        )
    
    if not successor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Successor task {dep_in.successor_id} not found",
        )
    
    # Ensure tasks are in the same project
    if predecessor.project_id != successor.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create dependency between tasks in different projects",
        )
    
    # Check if dependency already exists
    existing = await session.get(
        Dependency, 
        (dep_in.predecessor_id, dep_in.successor_id)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dependency already exists",
        )
    
    # Prevent self-loops
    if dep_in.predecessor_id == dep_in.successor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A task cannot depend on itself",
        )
    
    # Cycle detection
    has_cycle = await detect_cycle(
        session,
        predecessor.project_id,
        dep_in.predecessor_id,
        dep_in.successor_id,
    )
    
    if has_cycle:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Adding this dependency would create a cycle",
        )
    
    # Create the dependency
    dependency = Dependency(
        predecessor_id=dep_in.predecessor_id,
        successor_id=dep_in.successor_id,
    )
    session.add(dependency)
    await session.flush()
    await session.refresh(dependency)
    
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
    return list(result.scalars().all())


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependency not found",
        )
    
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

