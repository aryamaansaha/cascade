# Cascade

**A visual task scheduling tool with automatic dependency management**

🔗 **Live:** [cascade-roan.vercel.app](https://cascade-roan.vercel.app/)

![Cascade Screenshot](frontend/public/cascade_logo.png)

## What is Cascade?

Cascade helps you plan projects by visualizing task dependencies as a directed graph. When you change a task's date or duration, dependent tasks automatically adjust - just like a cascade of dominoes.

## Key Features

### 📊 Visual Task Graph
- Drag-and-drop task nodes on an interactive canvas
- Connect tasks to create dependencies (A must finish before B starts)
- See your entire project at a glance

### ⚡ Critical Path Analysis
- Automatically identifies which tasks are on the critical path
- Shows slack time for each task (how much buffer before it affects the deadline)
- Critical tasks highlighted in red - delay these and your project slips

### 🔮 What-If Simulation
- Preview the impact of changes before committing
- "What happens if Task X slips by 2 weeks?" — see the ripple effect instantly
- Make informed decisions about schedule changes

### 📅 Smart Date Propagation
- Change a predecessor's duration → successors automatically adjust
- Respects user-defined slack time when valid
- Async background processing for instant UI feedback

### 🎯 Deadline Tracking
- Set project deadlines and see if you're on track
- Visual warnings when projected end date exceeds deadline

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, ReactFlow, Mantine |
| Backend | FastAPI, Python, PostgreSQL |
| Async Jobs | ARQ (Redis-based worker queue) |
| Algorithms | NetworkX for DAG operations, Critical Path Method |

## How It Works

1. **Create tasks** with duration and start dates
2. **Draw dependencies** by connecting task handles
3. **Cascade recalculates** all downstream dates automatically
4. **View critical path** to know which tasks can't slip
5. **Simulate changes** before committing to see the impact

## Local Development

```bash
# Start PostgreSQL + Redis
docker compose up -d

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## License

MIT

