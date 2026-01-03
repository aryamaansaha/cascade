"""
Cascade - DAG-based task management engine with automatic date propagation.
"""

import subprocess
import sys
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import init_db
from app.routes import tasks, dependencies, projects
from app.exceptions import register_exception_handlers
from app.logging_config import setup_logging, get_logger

# Initialize logging
setup_logging()
logger = get_logger(__name__)

# Global reference to worker process
_worker_process: subprocess.Popen | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    global _worker_process
    
    logger.info("Starting Cascade API...")
    await init_db()
    logger.info("Database initialized")
    
    # Start ARQ worker as a subprocess
    logger.info("Starting ARQ worker...")
    try:
        _worker_process = subprocess.Popen(
            [sys.executable, "-m", "arq", "app.worker.WorkerSettings"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        logger.info(f"ARQ worker started (PID: {_worker_process.pid})")
    except Exception as e:
        logger.error(f"Failed to start ARQ worker: {e}")
    
    yield
    
    # Shutdown: terminate worker
    logger.info("Shutting down Cascade API...")
    if _worker_process:
        logger.info("Terminating ARQ worker...")
        _worker_process.terminate()
        try:
            _worker_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _worker_process.kill()
        logger.info("ARQ worker terminated")


app = FastAPI(
    title="Cascade",
    description="DAG-based task management engine with automatic date propagation",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware - allow frontend to access API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
