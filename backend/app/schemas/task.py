import uuid
from datetime import date, datetime, timedelta
from pydantic import BaseModel, computed_field


class TaskCreate(BaseModel):
    """Schema for creating a new task."""
    title: str
    description: str | None = None
    duration_days: int = 1
    start_date: date | None = None  # Defaults to today if not provided
    project_id: uuid.UUID


class TaskUpdate(BaseModel):
    """Schema for updating a task."""
    title: str | None = None
    description: str | None = None
    duration_days: int | None = None
    start_date: date | None = None


class TaskRead(BaseModel):
    """Schema for reading a task with computed end_date."""
    id: uuid.UUID
    title: str
    description: str | None
    duration_days: int
    start_date: date
    calc_version_id: uuid.UUID
    project_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    
    @computed_field
    @property
    def end_date(self) -> date:
        """
        Computed end_date based on start_date + duration.
        
        Formula: end_date = start_date + duration_days - 1 (if duration > 0)
        For milestones (duration=0): end_date = start_date
        
        Example: Task starts Monday (day 1), duration=3 days
        -> Consumes Mon, Tue, Wed -> end_date = Wednesday
        -> start_date + 3 - 1 = start_date + 2
        """
        if self.duration_days == 0:
            return self.start_date
        return self.start_date + timedelta(days=self.duration_days - 1)
    
    model_config = {"from_attributes": True}

