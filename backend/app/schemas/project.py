import uuid
from datetime import datetime
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: str | None = None
    description: str | None = None


class ProjectRead(BaseModel):
    """Schema for reading a project."""
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}

