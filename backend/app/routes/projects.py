"""
Project routes for the Cascade API.
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, status, HTTPException
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
    SimulationRequest,
    SimulationResponse,
    TaskImpactResponse,
)
from app.exceptions import NotFoundError
from app.logging_config import get_logger
from app.services.critical_path import analyze_critical_path
from app.services.simulation import simulate_changes, TaskChange
from app.auth import get_current_user, AuthenticatedUser

logger = get_logger(__name__)

router = APIRouter()


async def check_project_ownership(
    project: Project,
    user: AuthenticatedUser
) -> None:
    """Check if user owns the project, raise 403 if not."""
    if project.owner_id != user.uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )


@router.post("/", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_in: ProjectCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Project:
    """Create a new project."""
    project = Project(**project_in.model_dump(), owner_id=user.uid)
    session.add(project)
    await session.flush()
    await session.refresh(project)
    
    logger.info(f"Created project: id={project.id} name='{project.name}' owner={user.uid}")
    
    return project


@router.get("/", response_model=list[ProjectRead])
async def list_projects(
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Project]:
    """List all projects owned by the current user."""
    result = await session.execute(
        select(Project).where(Project.owner_id == user.uid)
    )
    projects = list(result.scalars().all())
    
    logger.debug(f"Listed {len(projects)} projects for user={user.uid}")
    
    return projects


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Project:
    """Get a project by ID."""
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    
    # Check ownership
    await check_project_ownership(project, user)
    
    return project


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    project_in: ProjectUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Project:
    """Update a project."""
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    
    await check_project_ownership(project, user)
    
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
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a project and all its tasks."""
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    
    await check_project_ownership(project, user)
    
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
    user: AuthenticatedUser = Depends(get_current_user),
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
    
    await check_project_ownership(project, user)
    
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
    user: AuthenticatedUser = Depends(get_current_user),
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
    
    await check_project_ownership(project, user)
    
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


@router.post("/{project_id}/simulate", response_model=SimulationResponse)
async def simulate_project_changes(
    project_id: uuid.UUID,
    request: SimulationRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SimulationResponse:
    """
    Simulate what-if changes to tasks without persisting.
    
    Accepts a list of hypothetical changes (start_date and/or duration_days)
    and returns the ripple effect on the project schedule.
    
    Example:
        POST /projects/{id}/simulate
        {
            "changes": [
                {"task_id": "abc...", "start_date": "2026-02-01"},
                {"task_id": "def...", "duration_days": 10}
            ]
        }
    
    Returns:
    - original_end_date: Project end before changes
    - simulated_end_date: Project end after changes
    - impact_days: How many days the project shifted
    - affected_tasks: List of tasks with changed dates
    """
    project = await session.get(Project, project_id)
    if not project:
        raise NotFoundError("Project", str(project_id))
    
    await check_project_ownership(project, user)
    
    # Convert request to service layer objects
    changes = [
        TaskChange(
            task_id=c.task_id,
            start_date=c.start_date,
            duration_days=c.duration_days,
        )
        for c in request.changes
    ]
    
    logger.info(f"Simulating {len(changes)} changes for project {project_id}")
    
    result = await simulate_changes(session, project_id, changes)
    
    logger.info(
        f"Simulation result: project end moved {result.impact_days} days "
        f"({result.original_end_date} → {result.simulated_end_date}), "
        f"{len(result.affected_tasks)} tasks affected"
    )
    
    return SimulationResponse(
        project_id=result.project_id,
        original_end_date=result.original_end_date,
        simulated_end_date=result.simulated_end_date,
        impact_days=result.impact_days,
        affected_tasks=[
            TaskImpactResponse(
                task_id=t.task_id,
                title=t.title,
                original_start=t.original_start,
                original_end=t.original_end,
                simulated_start=t.simulated_start,
                simulated_end=t.simulated_end,
                delta_days=t.delta_days,
            )
            for t in result.affected_tasks
        ],
        total_tasks=result.total_tasks,
    )
