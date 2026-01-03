"""
Project routes for the Cascade API.
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete as sql_delete
from sqlmodel import select

from app.database import get_session
from app.models import Project, Task, Dependency
from app.schemas import (
    ProjectCreate,
    ProjectUpdate,
    ProjectRead,
    ProjectStatus,
    CriticalPathAnalysis,
    TaskCriticalAnalysis,
)
from app.exceptions import NotFoundError
from app.logging_config import get_logger
from app.services.critical_path import analyze_critical_path

logger = get_logger(__name__)

router = APIRouter()


@router.post("/", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_in: ProjectCreate,
    session: AsyncSession = Depends(get_session),
) -> Project:
    """Create a new project."""
    project = Project(**project_in.model_dump())
    session.add(project)
    await session.flush()
    await session.refresh(project)
    
    logger.info(f"Created project: id={project.id} name='{project.name}'")
    
    return project


@router.get("/", response_model=list[ProjectRead])
async def list_projects(
    session: AsyncSession = Depends(get_session),
) -> list[Project]:
    """List all projects."""
    result = await session.execute(select(Project))
    projects = list(result.scalars().all())
    
    logger.debug(f"Listed {len(projects)} projects")
    
    return projects


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Project:
    """Get a project by ID."""
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    return project


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    project_in: ProjectUpdate,
    session: AsyncSession = Depends(get_session),
) -> Project:
    """Update a project."""
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    
    update_data = project_in.model_dump(exclude_unset=True)
    
    logger.info(f"Updating project {project_id}: {update_data}")
    
    for field, value in update_data.items():
        setattr(project, field, value)
    
    project.updated_at = datetime.utcnow()
    await session.flush()
    await session.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a project and all its tasks."""
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    
    logger.info(f"Deleting project {project_id}: '{project.name}'")
    
    # Get all task IDs for this project
    task_ids_result = await session.execute(
        select(Task.id).where(Task.project_id == project_id)
    )
    task_ids = [row[0] for row in task_ids_result.fetchall()]
    
    if task_ids:
        # Delete all dependencies involving these tasks
        await session.execute(
            sql_delete(Dependency).where(
                (Dependency.predecessor_id.in_(task_ids)) | 
                (Dependency.successor_id.in_(task_ids))
            )
        )
        
        # Delete all tasks in this project
        await session.execute(
            sql_delete(Task).where(Task.project_id == project_id)
        )
        
        logger.info(f"Deleted {len(task_ids)} tasks from project {project_id}")
    
    # Delete the project
    await session.delete(project)


@router.get("/{project_id}/status", response_model=ProjectStatus)
async def get_project_status(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ProjectStatus:
    """
    Get project status including deadline analysis.
    
    Returns:
    - projected_end_date: The latest end_date among all tasks
    - is_over_deadline: True if projected > deadline
    - days_over: How many days over (positive) or ahead (negative)
    """
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    
    # Calculate projected end date from tasks
    # end_date = start_date + duration_days - 1
    tasks_result = await session.execute(
        select(Task.start_date, Task.duration_days).where(Task.project_id == project_id)
    )
    tasks_data = tasks_result.all()
    
    projected_end_date = None
    task_count = len(tasks_data)
    if tasks_data:
        from datetime import timedelta
        end_dates = []
        for start_date, duration_days in tasks_data:
            if duration_days == 0:
                end_dates.append(start_date)
            else:
                end_dates.append(start_date + timedelta(days=duration_days - 1))
        projected_end_date = max(end_dates)
    
    # Calculate deadline status
    is_over_deadline = False
    days_over = None
    
    if project.deadline and projected_end_date:
        delta = (projected_end_date - project.deadline).days
        days_over = delta
        is_over_deadline = delta > 0
    
    return ProjectStatus(
        project_id=project_id,
        deadline=project.deadline,
        projected_end_date=projected_end_date,
        task_count=task_count,
        is_over_deadline=is_over_deadline,
        days_over=days_over,
    )


@router.get("/{project_id}/critical-path", response_model=CriticalPathAnalysis)
async def get_critical_path(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> CriticalPathAnalysis:
    """
    Get Critical Path Method (CPM) analysis for a project.
    
    Returns:
    - project_end_date: The calculated project completion date
    - critical_path_task_ids: IDs of tasks on the critical path (slack = 0)
    - task_analyses: Detailed analysis for each task including slack times
    """
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    
    analysis = await analyze_critical_path(session, project_id)
    
    if not analysis:
        raise NotFoundError("Tasks", f"No tasks found in project {project_id}")
    
    return CriticalPathAnalysis(
        project_id=analysis.project_id,
        project_end_date=analysis.project_end_date,
        critical_path_task_ids=analysis.critical_path_task_ids,
        task_analyses=[
            TaskCriticalAnalysis(
                task_id=ta.task_id,
                title=ta.title,
                duration_days=ta.duration_days,
                earliest_start=ta.earliest_start,
                earliest_finish=ta.earliest_finish,
                latest_start=ta.latest_start,
                latest_finish=ta.latest_finish,
                total_slack=ta.total_slack,
                is_critical=ta.is_critical,
            )
            for ta in analysis.task_analyses
        ],
    )
