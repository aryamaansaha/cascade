/**
 * Main application shell with sidebar, canvas, and inspector layout.
 */

import { useState, useEffect } from 'react';
import type { Project, Task, Dependency, ProjectStatus, CriticalPathAnalysis } from '../../api/types';
import { ConfirmModal } from '../ConfirmModal';
import { SimulationModal } from '../SimulationModal';
import { getEarliestStartDate, formatDateLong } from '../../utils/scheduling';
import './AppShell.css';

interface AppShellProps {
  // Left sidebar
  projects: Project[];
  selectedProjectId: string | null;
  projectStatus?: ProjectStatus;
  criticalPath?: CriticalPathAnalysis;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => Promise<void>;
  // Center canvas
  children: React.ReactNode;
  // Right inspector
  selectedTask: Task | null;
  tasks: Task[];
  dependencies: Dependency[];
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => Promise<void>;
  onCreateTask: () => void;
}

export function AppShell({
  projects,
  selectedProjectId,
  projectStatus,
  criticalPath,
  searchTerm,
  onSearchChange,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  children,
  selectedTask,
  tasks,
  dependencies,
  onUpdateTask,
  onDeleteTask,
  onCreateTask,
}: AppShellProps) {
  // Task delete confirmation state
  const [deleteTaskConfirmOpen, setDeleteTaskConfirmOpen] = useState(false);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  // Project delete confirmation state
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const handleDeleteTaskRequest = () => {
    setDeleteTaskConfirmOpen(true);
  };

  const handleDeleteTaskConfirm = async () => {
    if (!selectedTask) return;
    
    setIsDeletingTask(true);
    try {
      await onDeleteTask(selectedTask.id);
      setDeleteTaskConfirmOpen(false);
    } finally {
      setIsDeletingTask(false);
    }
  };

  const handleDeleteProjectRequest = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't select the project
    setProjectToDelete(project);
    setDeleteProjectConfirmOpen(true);
  };

  const handleDeleteProjectConfirm = async () => {
    if (!projectToDelete) return;
    
    setIsDeletingProject(true);
    try {
      await onDeleteProject(projectToDelete.id);
      setDeleteProjectConfirmOpen(false);
      setProjectToDelete(null);
    } finally {
      setIsDeletingProject(false);
    }
  };

  return (
    <div className="app-shell">
      {/* Left Sidebar - Projects */}
      <aside className="sidebar sidebar-left">
        <div className="sidebar-header">
          <img src="/cascade_logo.png" alt="Cascade" className="logo-icon" />
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
                <button
                  className="btn-icon project-delete"
                  onClick={(e) => handleDeleteProjectRequest(project, e)}
                  title="Delete Project"
                >
                  ×
                </button>
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
              <div className="search-container">
                <input
                  type="text"
                  className="search-input"
                  placeholder="🔍 Search tasks..."
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className="search-clear"
                    onClick={() => onSearchChange('')}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <span className="toolbar-hint">
                💡 Drag between handles to connect • Ctrl+Z to undo
              </span>
            </div>
            
            {/* Deadline Status Banner */}
            {projectStatus && (
              <DeadlineBanner status={projectStatus} />
            )}
            
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
              tasks={tasks}
              dependencies={dependencies}
              criticalPath={criticalPath}
              projectId={selectedProjectId!}
              onUpdate={onUpdateTask}
              onDeleteRequest={handleDeleteTaskRequest}
            />
          ) : (
            <div className="empty-state">
              <p>Select a task to edit</p>
            </div>
          )}
        </div>
      </aside>

      {/* Delete Task Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteTaskConfirmOpen}
        onClose={() => setDeleteTaskConfirmOpen(false)}
        onConfirm={handleDeleteTaskConfirm}
        title="Delete Task"
        message={`Are you sure you want to delete "${selectedTask?.title}"? This action cannot be undone, and any dependent tasks may be affected.`}
        confirmText="Delete Task"
        confirmVariant="danger"
        isLoading={isDeletingTask}
      />

      {/* Delete Project Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteProjectConfirmOpen}
        onClose={() => {
          setDeleteProjectConfirmOpen(false);
          setProjectToDelete(null);
        }}
        onConfirm={handleDeleteProjectConfirm}
        title="Delete Project"
        message={`Are you sure you want to delete "${projectToDelete?.name}"? This will permanently delete all tasks and dependencies in this project.`}
        confirmText="Delete Project"
        confirmVariant="danger"
        isLoading={isDeletingProject}
      />
    </div>
  );
}

// =============================================================================
// Task Inspector Component
// =============================================================================

interface TaskInspectorProps {
  task: Task;
  tasks: Task[];
  dependencies: Dependency[];
  criticalPath?: CriticalPathAnalysis;
  projectId: string;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDeleteRequest: () => void;
}

function TaskInspector({ task, tasks, dependencies, criticalPath, projectId, onUpdate, onDeleteRequest }: TaskInspectorProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [duration, setDuration] = useState(task.duration_days);
  const [startDate, setStartDate] = useState(task.start_date);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);

  // Calculate earliest valid start date (if task has predecessors)
  const earliestStart = getEarliestStartDate(task.id, tasks, dependencies);
  const hasPredecessors = earliestStart !== null;
  
  // Get critical path analysis for this task
  const taskAnalysis = criticalPath?.task_analyses.find(ta => ta.task_id === task.id);
  const isCritical = taskAnalysis?.is_critical ?? false;
  const slackDays = taskAnalysis?.total_slack;

  // Update local state when task changes
  useEffect(() => {
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
          {hasPredecessors && earliestStart && (
            <span className="date-constraint-hint">
              Earliest: {formatDateLong(earliestStart)}
            </span>
          )}
        </div>
      </div>

      <div className="info-section">
        <div className="info-row">
          <span className="info-label">End Date</span>
          <span className="info-value">{task.end_date}</span>
        </div>
        {slackDays !== undefined && (
          <div className="info-row">
            <span className="info-label">Slack</span>
            <span className={`info-value ${isCritical ? 'critical-text' : 'slack-text'}`}>
              {isCritical ? (
                <>⚡ Critical Path (0 days)</>
              ) : (
                <>{slackDays} {slackDays === 1 ? 'day' : 'days'}</>
              )}
            </span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">Version</span>
          <span className="info-value version-id">{task.calc_version_id.slice(0, 8)}...</span>
        </div>
      </div>

      <div className="action-buttons">
        <button className="btn-whatif" onClick={() => setIsSimulationOpen(true)}>
          🔮 What-If
        </button>
      </div>

      <div className="danger-zone">
        <button className="btn-danger" onClick={onDeleteRequest}>
          Delete Task
        </button>
      </div>
      
      <SimulationModal
        isOpen={isSimulationOpen}
        onClose={() => setIsSimulationOpen(false)}
        task={task}
        projectId={projectId}
      />
    </div>
  );
}

// =============================================================================
// Deadline Banner Component
// =============================================================================

interface DeadlineBannerProps {
  status: ProjectStatus;
}

function DeadlineBanner({ status }: DeadlineBannerProps) {
  const { deadline, projected_end_date, is_over_deadline, days_over, task_count } = status;
  
  // Don't show if no deadline set
  if (!deadline) {
    return null;
  }
  
  // Don't show if no tasks
  if (task_count === 0) {
    return null;
  }
  
  const bannerClass = is_over_deadline ? 'deadline-banner over' : 'deadline-banner on-track';
  
  return (
    <div className={bannerClass}>
      {is_over_deadline ? (
        <>
          <span className="deadline-icon">⚠️</span>
          <span className="deadline-text">
            <strong>{days_over} days over deadline</strong>
            <span className="deadline-details">
              Projected: {formatDateLong(projected_end_date!)} • Deadline: {formatDateLong(deadline)}
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="deadline-icon">✓</span>
          <span className="deadline-text">
            <strong>On track</strong>
            <span className="deadline-details">
              {days_over !== null && days_over < 0 
                ? `${Math.abs(days_over)} days ahead`
                : 'Right on deadline'
              } • Deadline: {formatDateLong(deadline)}
            </span>
          </span>
        </>
      )}
    </div>
  );
}

export default AppShell;
