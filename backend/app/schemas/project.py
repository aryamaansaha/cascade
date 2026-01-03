import uuid
from datetime import datetime, date
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""
    name: str
    description: str | None = None
    deadline: date | None = None


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: str | None = None
    description: str | None = None
    deadline: date | None = None


class ProjectRead(BaseModel):
    """Schema for reading a project."""
    id: uuid.UUID
    name: str
    description: str | None
    deadline: date | None
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class ProjectStatus(BaseModel):
    """Schema for project status including deadline analysis."""
    project_id: uuid.UUID
    deadline: date | None
    projected_end_date: date | None  # Latest task end date
    task_count: int
    is_over_deadline: bool
    days_over: int | None  # Positive if over, negative if ahead, None if no deadline


class TaskCriticalAnalysis(BaseModel):
    """CPM analysis for a single task."""
    task_id: uuid.UUID
    title: str
    duration_days: int
    earliest_start: date
    earliest_finish: date
    latest_start: date
    latest_finish: date
    total_slack: int  # Days of slack (0 = critical)
    is_critical: bool


class CriticalPathAnalysis(BaseModel):
    """Complete CPM analysis for a project."""
    project_id: uuid.UUID
    project_end_date: date
    critical_path_task_ids: list[uuid.UUID]
    task_analyses: list[TaskCriticalAnalysis]

