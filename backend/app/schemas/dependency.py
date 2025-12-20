import uuid
from datetime import datetime
from pydantic import BaseModel


class DependencyCreate(BaseModel):
    """Schema for creating a new dependency."""
    predecessor_id: uuid.UUID  # The blocker task
    successor_id: uuid.UUID    # The blocked task


class DependencyRead(BaseModel):
    """Schema for reading a dependency."""
    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    created_at: datetime
    
    model_config = {"from_attributes": True}

