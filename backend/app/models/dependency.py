import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.task import Task


class Dependency(SQLModel, table=True):
    """
    Dependency model representing a directed edge in the task DAG.
    
    predecessor_id -> successor_id means:
    "The predecessor (blocker) must complete before the successor (blocked) can start"
    
    Example: If Task A blocks Task B:
    - predecessor_id = A.id (the blocker)
    - successor_id = B.id (the blocked)
    """
    
    __tablename__ = "dependencies"
    
    # Composite primary key
    predecessor_id: uuid.UUID = Field(
        foreign_key="tasks.id",
        primary_key=True,
    )
    successor_id: uuid.UUID = Field(
        foreign_key="tasks.id",
        primary_key=True,
    )
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    predecessor: "Task" = Relationship(
        back_populates="successors",
        sa_relationship_kwargs={"foreign_keys": "Dependency.predecessor_id"},
    )
    successor: "Task" = Relationship(
        back_populates="predecessors",
        sa_relationship_kwargs={"foreign_keys": "Dependency.successor_id"},
    )

