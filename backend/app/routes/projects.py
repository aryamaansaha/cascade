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
from app.schemas import ProjectCreate, ProjectUpdate, ProjectRead
from app.exceptions import NotFoundError
from app.logging_config import get_logger

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
