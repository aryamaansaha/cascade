/**
 * Main application shell with sidebar, canvas, and inspector layout.
 */

import React from 'react';
import type { Project, Task } from '../../api/types';
import './AppShell.css';

interface AppShellProps {
  // Left sidebar
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  // Center canvas
  children: React.ReactNode;
  // Right inspector
  selectedTask: Task | null;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onCreateTask: () => void;
}

export function AppShell({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  children,
  selectedTask,
  onUpdateTask,
  onDeleteTask,
  onCreateTask,
}: AppShellProps) {
  return (
    <div className="app-shell">
      {/* Left Sidebar - Projects */}
      <aside className="sidebar sidebar-left">
        <div className="sidebar-header">
          <h1 className="logo">Cascade</h1>
        </div>
        <div className="sidebar-content">
          <div className="section-header">
            <span>Projects</span>
            <button className="btn-icon" onClick={onCreateProject} title="New Project">
              +
            </button>
          </div>
          <ul className="project-list">
            {projects.map((project) => (
              <li
                key={project.id}
                className={`project-item ${selectedProjectId === project.id ? 'active' : ''}`}
                onClick={() => onSelectProject(project.id)}
              >
                <span className="project-icon">📁</span>
                <span className="project-name">{project.name}</span>
              </li>
            ))}
            {projects.length === 0 && (
              <li className="empty-state">No projects yet</li>
            )}
          </ul>
        </div>
      </aside>

      {/* Center - Canvas */}
      <main className="canvas-container">
        {selectedProjectId ? (
          <>
            <div className="canvas-toolbar">
              <button className="btn-secondary" onClick={onCreateTask}>
                + New Task
              </button>
            </div>
            {children}
          </>
        ) : (
          <div className="empty-canvas">
            <div className="empty-canvas-content">
              <span className="empty-icon">📊</span>
              <h2>Select a project</h2>
              <p>Choose a project from the sidebar or create a new one</p>
            </div>
          </div>
        )}
      </main>

      {/* Right Sidebar - Inspector */}
      <aside className="sidebar sidebar-right">
        <div className="sidebar-header">
          <h2>Inspector</h2>
        </div>
        <div className="sidebar-content">
          {selectedTask ? (
            <TaskInspector
              task={selectedTask}
              onUpdate={onUpdateTask}
              onDelete={onDeleteTask}
            />
          ) : (
            <div className="empty-state">
              <p>Select a task to edit</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// =============================================================================
// Task Inspector Component
// =============================================================================

interface TaskInspectorProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

function TaskInspector({ task, onUpdate, onDelete }: TaskInspectorProps) {
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description || '');
  const [duration, setDuration] = React.useState(task.duration_days);
  const [startDate, setStartDate] = React.useState(task.start_date);

  // Update local state when task changes
  React.useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDuration(task.duration_days);
    setStartDate(task.start_date);
  }, [task]);

  const handleBlur = (field: string, value: string | number) => {
    const updates: Partial<Task> = {};
    
    switch (field) {
      case 'title':
        if (value !== task.title) updates.title = value as string;
        break;
      case 'description':
        if (value !== (task.description || '')) updates.description = value as string;
        break;
      case 'duration_days':
        if (value !== task.duration_days) updates.duration_days = value as number;
        break;
      case 'start_date':
        if (value !== task.start_date) updates.start_date = value as string;
        break;
    }
    
    if (Object.keys(updates).length > 0) {
      onUpdate(task.id, updates);
    }
  };

  return (
    <div className="task-inspector">
      <div className="form-group">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => handleBlur('title', title)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => handleBlur('description', description)}
          rows={3}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="duration">Duration (days)</label>
          <input
            id="duration"
            type="number"
            min={0}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
            onBlur={() => handleBlur('duration_days', duration)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="start_date">Start Date</label>
          <input
            id="start_date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onBlur={() => handleBlur('start_date', startDate)}
          />
        </div>
      </div>

      <div className="info-section">
        <div className="info-row">
          <span className="info-label">End Date</span>
          <span className="info-value">{task.end_date}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Version</span>
          <span className="info-value version-id">{task.calc_version_id.slice(0, 8)}...</span>
        </div>
      </div>

      <div className="danger-zone">
        <button
          className="btn-danger"
          onClick={() => {
            if (confirm('Are you sure you want to delete this task?')) {
              onDelete(task.id);
            }
          }}
        >
          Delete Task
        </button>
      </div>
    </div>
  );
}

export default AppShell;

