"""
Cascade - DAG-based task management engine with automatic date propagation.
"""

from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.database import init_db
from app.routes import tasks, dependencies, projects
from app.exceptions import register_exception_handlers, CascadeException
from app.logging_config import setup_logging, get_logger

# Initialize logging
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    logger.info("Starting Cascade API...")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down Cascade API...")


app = FastAPI(
    title="Cascade",
    description="DAG-based task management engine with automatic date propagation",
    version="0.1.0",
    lifespan=lifespan,
)

# Register custom exception handlers
register_exception_handlers(app)

# Include routers
app.include_router(projects.router, prefix="/projects", tags=["Projects"])
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(dependencies.router, prefix="/dependencies", tags=["Dependencies"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
