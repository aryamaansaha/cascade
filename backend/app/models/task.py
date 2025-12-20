import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.dependency import Dependency


class Task(SQLModel, table=True):
    """
    Task model with computed start_date and version tracking.
    
    Key fields:
    - start_date: The computed/cached absolute start date
    - duration_days: How long the task takes (0 = milestone)
    - calc_version_id: Concurrency guard - changes on every edit
    """
    
    __tablename__ = "tasks"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(index=True)
    description: str | None = Field(default=None)
    duration_days: int = Field(default=1, ge=0)  # 0 = milestone
    start_date: date = Field(default_factory=date.today)
    calc_version_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    
    # Foreign keys
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    project: "Project" = Relationship(back_populates="tasks")
    
    # Dependencies where this task is the predecessor (blocker)
    successors: list["Dependency"] = Relationship(
        back_populates="predecessor",
        sa_relationship_kwargs={"foreign_keys": "Dependency.predecessor_id"},
    )
    
    # Dependencies where this task is the successor (blocked)
    predecessors: list["Dependency"] = Relationship(
        back_populates="successor",
        sa_relationship_kwargs={"foreign_keys": "Dependency.successor_id"},
    )

