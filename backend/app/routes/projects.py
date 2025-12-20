import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import Project
from app.schemas import ProjectCreate, ProjectUpdate, ProjectRead

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
    return project


@router.get("/", response_model=list[ProjectRead])
async def list_projects(
    session: AsyncSession = Depends(get_session),
) -> list[Project]:
    """List all projects."""
    result = await session.execute(select(Project))
    return list(result.scalars().all())


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Project:
    """Get a project by ID."""
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    
    update_data = project_in.model_dump(exclude_unset=True)
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    
    await session.delete(project)

