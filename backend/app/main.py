from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.database import init_db
from app.routes import tasks, dependencies, projects


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    await init_db()
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(
    title="Cascade",
    description="DAG-based task management engine with automatic date propagation",
    version="0.1.0",
    lifespan=lifespan,
)

# Include routers
app.include_router(projects.router, prefix="/projects", tags=["Projects"])
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(dependencies.router, prefix="/dependencies", tags=["Dependencies"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}

