"""Add deadline column to projects table."""

import asyncio
from sqlalchemy import text
from app.database import engine


async def add_deadline_column():
    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(text('''
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'projects' AND column_name = 'deadline'
        '''))
        if result.fetchone() is None:
            await conn.execute(text('ALTER TABLE projects ADD COLUMN deadline DATE'))
            print('Added deadline column')
        else:
            print('Column already exists')


if __name__ == "__main__":
    asyncio.run(add_deadline_column())

