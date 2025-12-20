#!/usr/bin/env python3
"""
Seed script to generate a large task graph for performance testing.

Generates a 500-node DAG with realistic project structure:
- Multiple parallel tracks
- Diamond patterns (convergence points)
- Sequential chains
- Milestones

Usage:
    python -m scripts.seed [--nodes 500] [--clear]
    
Options:
    --nodes N    Number of nodes to generate (default: 500)
    --clear      Clear existing data before seeding
    --project    Name of the project to create
"""

import argparse
import asyncio
import random
import time
from datetime import date, timedelta
from typing import List, Tuple
import uuid

from sqlmodel import select
from sqlalchemy import text

from app.database import async_session_maker, engine, init_db
from app.models import Project, Task, Dependency


async def clear_data():
    """Clear all existing data."""
    print("Clearing existing data...")
    async with async_session_maker() as session:
        await session.execute(text("TRUNCATE dependencies, tasks, projects CASCADE"))
        await session.commit()
    print("Data cleared.")


async def create_project(name: str) -> Project:
    """Create a project for the tasks."""
    async with async_session_maker() as session:
        project = Project(name=name, description=f"Performance test project with tasks")
        session.add(project)
        await session.commit()
        await session.refresh(project)
        return project


async def generate_dag(
    project_id: uuid.UUID,
    num_nodes: int = 500,
) -> Tuple[List[Task], List[Dependency]]:
    """
    Generate a realistic DAG structure.
    
    Strategy:
    - Create tasks in "waves" (levels)
    - Each wave depends on some tasks from previous waves
    - Include diamond patterns and parallel tracks
    - 10% of tasks are milestones (duration=0)
    
    Returns:
        Tuple of (tasks, dependencies)
    """
    tasks = []
    dependencies = []
    
    # Configuration
    num_waves = max(10, num_nodes // 50)  # ~50 tasks per wave
    tasks_per_wave = num_nodes // num_waves
    start_date = date(2025, 1, 1)
    
    print(f"Generating {num_nodes} tasks in {num_waves} waves...")
    
    task_ids_by_wave = []  # Track task IDs per wave for dependency creation
    
    for wave in range(num_waves):
        wave_tasks = []
        wave_size = tasks_per_wave
        
        # Last wave gets remaining tasks
        if wave == num_waves - 1:
            wave_size = num_nodes - len(tasks)
        
        for i in range(wave_size):
            # 10% chance of milestone
            is_milestone = random.random() < 0.1
            duration = 0 if is_milestone else random.randint(1, 10)
            
            task = Task(
                title=f"Task W{wave:02d}-{i:03d}",
                description=f"Wave {wave}, Task {i}",
                duration_days=duration,
                start_date=start_date,  # Will be recalculated
                project_id=project_id,
            )
            tasks.append(task)
            wave_tasks.append(task)
        
        task_ids_by_wave.append(wave_tasks)
        
        # Create dependencies from previous waves
        if wave > 0:
            for task in wave_tasks:
                # Each task depends on 1-3 tasks from previous waves
                num_deps = random.randint(1, min(3, len(task_ids_by_wave[wave - 1])))
                
                # Prefer recent waves but occasionally reach back further
                available_waves = list(range(max(0, wave - 3), wave))
                
                for _ in range(num_deps):
                    dep_wave = random.choice(available_waves)
                    dep_task = random.choice(task_ids_by_wave[dep_wave])
                    
                    # Avoid duplicate dependencies
                    dep_key = (dep_task.id, task.id)
                    if not any(d.predecessor_id == dep_task.id and d.successor_id == task.id 
                               for d in dependencies):
                        dep = Dependency(
                            predecessor_id=dep_task.id,
                            successor_id=task.id,
                        )
                        dependencies.append(dep)
    
    return tasks, dependencies


async def insert_batch(tasks: List[Task], dependencies: List[Dependency]):
    """Insert tasks and dependencies in batches for performance."""
    async with async_session_maker() as session:
        batch_size = 100
        
        # Insert tasks in batches
        print(f"Inserting {len(tasks)} tasks...")
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i + batch_size]
            session.add_all(batch)
            await session.flush()
            if (i + batch_size) % 500 == 0:
                print(f"  Inserted {min(i + batch_size, len(tasks))} tasks...")
        
        await session.commit()
        
        # Refresh to get IDs
        for task in tasks:
            await session.refresh(task)
        
        # Insert dependencies in batches
        print(f"Inserting {len(dependencies)} dependencies...")
        for i in range(0, len(dependencies), batch_size):
            batch = dependencies[i:i + batch_size]
            session.add_all(batch)
            await session.flush()
            if (i + batch_size) % 500 == 0:
                print(f"  Inserted {min(i + batch_size, len(dependencies))} dependencies...")
        
        await session.commit()


async def trigger_full_recalc(project_id: uuid.UUID):
    """
    Trigger recalculation for all root tasks (no predecessors).
    """
    from app.worker import enqueue_recalc
    
    async with async_session_maker() as session:
        # Find root tasks (tasks with no predecessors)
        root_query = text("""
            SELECT t.id, t.calc_version_id
            FROM tasks t
            WHERE t.project_id = :project_id
              AND NOT EXISTS (
                  SELECT 1 FROM dependencies d WHERE d.successor_id = t.id
              )
        """)
        result = await session.execute(root_query, {"project_id": str(project_id)})
        root_tasks = result.fetchall()
        
        print(f"Found {len(root_tasks)} root tasks, triggering recalc...")
        
        for task_id, version_id in root_tasks:
            await enqueue_recalc(str(task_id), str(version_id))
        
        print("Recalc jobs enqueued.")


async def run_benchmark(project_id: uuid.UUID):
    """Run a benchmark by updating a root task and measuring cascade time."""
    from app.worker import enqueue_recalc
    
    async with async_session_maker() as session:
        # Find a root task
        root_query = text("""
            SELECT t.id
            FROM tasks t
            WHERE t.project_id = :project_id
              AND NOT EXISTS (
                  SELECT 1 FROM dependencies d WHERE d.successor_id = t.id
              )
            LIMIT 1
        """)
        result = await session.execute(root_query, {"project_id": str(project_id)})
        root_task = result.fetchone()
        
        if not root_task:
            print("No root tasks found!")
            return
        
        task_id = root_task[0]
        
        # Get the task
        task = await session.get(Task, task_id)
        
        print(f"\n=== Benchmark: Updating root task {task.title} ===")
        
        # Update and measure
        start_time = time.time()
        
        new_version = uuid.uuid4()
        task.start_date = task.start_date + timedelta(days=7)
        task.calc_version_id = new_version
        await session.commit()
        
        # Enqueue recalc
        await enqueue_recalc(str(task_id), str(new_version))
        
        api_time = time.time() - start_time
        print(f"API response time: {api_time * 1000:.2f}ms")
        print("(Worker recalc time is async - check worker logs)")


async def get_stats(project_id: uuid.UUID):
    """Get statistics about the generated graph."""
    async with async_session_maker() as session:
        # Count tasks
        task_count = await session.execute(
            text("SELECT COUNT(*) FROM tasks WHERE project_id = :pid"),
            {"pid": str(project_id)}
        )
        num_tasks = task_count.scalar()
        
        # Count dependencies
        dep_count = await session.execute(
            text("""
                SELECT COUNT(*) FROM dependencies d
                JOIN tasks t ON d.predecessor_id = t.id
                WHERE t.project_id = :pid
            """),
            {"pid": str(project_id)}
        )
        num_deps = dep_count.scalar()
        
        # Count root tasks
        root_count = await session.execute(
            text("""
                SELECT COUNT(*) FROM tasks t
                WHERE t.project_id = :pid
                  AND NOT EXISTS (SELECT 1 FROM dependencies d WHERE d.successor_id = t.id)
            """),
            {"pid": str(project_id)}
        )
        num_roots = root_count.scalar()
        
        # Count leaf tasks
        leaf_count = await session.execute(
            text("""
                SELECT COUNT(*) FROM tasks t
                WHERE t.project_id = :pid
                  AND NOT EXISTS (SELECT 1 FROM dependencies d WHERE d.predecessor_id = t.id)
            """),
            {"pid": str(project_id)}
        )
        num_leaves = leaf_count.scalar()
        
        # Avg dependencies per task
        avg_deps = num_deps / num_tasks if num_tasks > 0 else 0
        
        print(f"\n=== Graph Statistics ===")
        print(f"Tasks:        {num_tasks}")
        print(f"Dependencies: {num_deps}")
        print(f"Root tasks:   {num_roots} (no predecessors)")
        print(f"Leaf tasks:   {num_leaves} (no successors)")
        print(f"Avg deps/task: {avg_deps:.2f}")


async def main():
    parser = argparse.ArgumentParser(description="Seed the database with a large task graph")
    parser.add_argument("--nodes", type=int, default=500, help="Number of tasks to create")
    parser.add_argument("--clear", action="store_true", help="Clear existing data first")
    parser.add_argument("--project", type=str, default="Performance Test", help="Project name")
    parser.add_argument("--benchmark", action="store_true", help="Run benchmark after seeding")
    parser.add_argument("--recalc", action="store_true", help="Trigger full recalc after seeding")
    
    args = parser.parse_args()
    
    print(f"=== Cascade Seed Script ===")
    print(f"Generating {args.nodes} nodes...")
    
    # Initialize database
    await init_db()
    
    if args.clear:
        await clear_data()
    
    # Create project
    project = await create_project(args.project)
    print(f"Created project: {project.name} ({project.id})")
    
    # Generate DAG
    start_time = time.time()
    tasks, dependencies = await generate_dag(project.id, args.nodes)
    gen_time = time.time() - start_time
    print(f"Generation time: {gen_time:.2f}s")
    
    # Insert data
    start_time = time.time()
    await insert_batch(tasks, dependencies)
    insert_time = time.time() - start_time
    print(f"Insert time: {insert_time:.2f}s")
    
    # Show stats
    await get_stats(project.id)
    
    # Optional: trigger recalc
    if args.recalc:
        await trigger_full_recalc(project.id)
    
    # Optional: run benchmark
    if args.benchmark:
        await run_benchmark(project.id)
    
    print(f"\n=== Seeding Complete ===")
    print(f"Project ID: {project.id}")


if __name__ == "__main__":
    asyncio.run(main())

