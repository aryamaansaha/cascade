"""Add owner_id column to projects table for Firebase authentication."""

import asyncio
from sqlalchemy import text
from app.database import engine


async def add_owner_id_column():
    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(text('''
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'projects' AND column_name = 'owner_id'
        '''))
        
        if result.fetchone() is None:
            print('Adding owner_id column to projects table...')
            
            # Add the column (nullable first for existing rows)
            await conn.execute(text('''
                ALTER TABLE projects 
                ADD COLUMN owner_id VARCHAR NOT NULL DEFAULT 'anonymous'
            '''))
            
            # Create index for faster lookups
            await conn.execute(text('''
                CREATE INDEX IF NOT EXISTS ix_projects_owner_id 
                ON projects (owner_id)
            '''))
            
            print('✓ Added owner_id column')
            print('✓ Created index on owner_id')
            print('')
            print('Note: Existing projects have owner_id = "anonymous"')
            print('      You may want to reassign them to actual users')
        else:
            print('owner_id column already exists')


if __name__ == "__main__":
    asyncio.run(add_owner_id_column())

