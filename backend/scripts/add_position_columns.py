#!/usr/bin/env python3
"""
Migration script to add position_x and position_y columns to tasks table.
Run this once to update the existing database schema.
"""

import asyncio
from sqlalchemy import text
from app.database import engine


async def migrate():
    """Add position columns to tasks table."""
    async with engine.begin() as conn:
        # Check if columns exist
        result = await conn.execute(
            text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tasks' AND column_name = 'position_x'
            """)
        )
        if result.fetchone():
            print("✓ position_x column already exists")
            return
        
        # Add the columns
        print("Adding position_x and position_y columns...")
        await conn.execute(
            text("""
                ALTER TABLE tasks 
                ADD COLUMN position_x DOUBLE PRECISION,
                ADD COLUMN position_y DOUBLE PRECISION
            """)
        )
        print("✓ Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())


