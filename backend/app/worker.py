"""
ARQ Worker for background task processing.

This worker handles:
- recalc_subtree: Recalculates dates for all tasks downstream of a changed task

Usage:
    arq app.worker.WorkerSettings
"""

from arq import create_pool
from arq.connections import RedisSettings, ArqRedis

from app.config import get_settings
from app.services.recalc import recalc_subtree
from app.logging_config import setup_logging, get_logger

# Initialize logging for the worker
setup_logging()
logger = get_logger(__name__)

settings = get_settings()


def parse_redis_url(url: str) -> RedisSettings:
    """Parse redis URL into RedisSettings."""
    # redis://localhost:6380/0 -> host=localhost, port=6380, database=0
    url = url.replace("redis://", "")
    # Strip database number if present
    if "/" in url:
        url = url.split("/")[0]
    if ":" in url:
        host, port = url.split(":")
        return RedisSettings(host=host, port=int(port))
    return RedisSettings(host=url)


async def startup(ctx: dict) -> None:
    """Worker startup - initialize database connection."""
    logger.info("ARQ Worker starting up...")
    logger.info(f"Redis: {settings.redis_url}")


async def shutdown(ctx: dict) -> None:
    """Worker shutdown - cleanup."""
    logger.info("ARQ Worker shutting down...")


class WorkerSettings:
    """ARQ Worker configuration."""
    
    functions = [recalc_subtree]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = parse_redis_url(settings.redis_url)
    max_jobs = 10
    job_timeout = 300  # 5 minutes max per job


# Redis pool for enqueuing jobs from the API
_arq_pool: ArqRedis | None = None


async def get_arq_pool() -> ArqRedis:
    """Get or create the ARQ Redis pool for enqueuing jobs."""
    global _arq_pool
    if _arq_pool is None:
        logger.debug("Creating ARQ Redis pool")
        _arq_pool = await create_pool(
            parse_redis_url(settings.redis_url)
        )
    return _arq_pool


async def enqueue_recalc(task_id: str, version_id: str) -> None:
    """Enqueue a recalculation job for a task and its descendants."""
    pool = await get_arq_pool()
    logger.debug(f"Enqueuing recalc job: task={task_id[:8]}... version={version_id[:8]}...")
    await pool.enqueue_job("recalc_subtree", task_id, version_id)
