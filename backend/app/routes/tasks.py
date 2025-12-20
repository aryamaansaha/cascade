import uuid
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import Task, Project, Dependency
from app.schemas import TaskCreate, TaskUpdate, TaskRead
from app.worker import enqueue_recalc

router = APIRouter()


@router.post("/", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_in: TaskCreate,
    session: AsyncSession = Depends(get_session),
) -> Task:
    """
    Create a new task.
    
    If start_date is not provided, defaults to today.
    """
    # Verify project exists
    project = await session.get(Project, task_in.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {task_in.project_id} not found",
        )
    
    task_data = task_in.model_dump()
    if task_data["start_date"] is None:
        task_data["start_date"] = date.today()
    
    task = Task(**task_data)
    session.add(task)
    await session.flush()
    await session.refresh(task)
    
    # TODO: In Phase 3, trigger low-priority recalc job here
    
    return task


@router.get("/", response_model=list[TaskRead])
async def list_tasks(
    project_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[Task]:
    """
    List tasks.
    
    Optionally filter by project_id.
    """
    query = select(Task)
    if project_id:
        query = query.where(Task.project_id == project_id)
    
    result = await session.execute(query)
    return list(result.scalars().all())


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Task:
    """Get a task by ID."""
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return task


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: uuid.UUID,
    task_in: TaskUpdate,
    session: AsyncSession = Depends(get_session),
) -> Task:
    """
    Update a task.
    
    Generates a new calc_version_id and triggers async recalculation
    of all dependent tasks.
    """
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    
    update_data = task_in.model_dump(exclude_unset=True)
    
    # Update fields
    for field, value in update_data.items():
        setattr(task, field, value)
    
    # Generate new version ID for concurrency control
    new_version_id = uuid.uuid4()
    task.calc_version_id = new_version_id
    task.updated_at = datetime.utcnow()
    
    await session.flush()
    await session.refresh(task)
    
    # Enqueue recalc job for this task and its descendants
    await enqueue_recalc(str(task_id), str(new_version_id))
    
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """
    Delete a task.
    
    This will also delete all dependencies involving this task
    and trigger recalculation of affected tasks.
    """
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    
    # Find all direct successors before deletion - they need recalculation
    successors_query = select(Dependency.successor_id).where(
        Dependency.predecessor_id == task_id
    )
    successors_result = await session.execute(successors_query)
    successor_ids = [row[0] for row in successors_result.all()]
    
    # Delete the task (cascades to dependencies via FK)
    await session.delete(task)
    await session.flush()
    
    # Trigger recalc for each successor (they may now start earlier)
    for successor_id in successor_ids:
        successor = await session.get(Task, successor_id)
        if successor:
            # Update version to trigger recalc
            new_version_id = uuid.uuid4()
            successor.calc_version_id = new_version_id
            await session.flush()
            await enqueue_recalc(str(successor_id), str(new_version_id))

