/**
 * Main Cascade application component.
 * 
 * Orchestrates:
 * - Project selection and management
 * - Task graph visualization
 * - Task editing via the inspector
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import { AppShell } from './components/layout/AppShell';
import { FlowCanvas } from './components/graph/FlowCanvas';
import { CreateProjectModal } from './components/CreateProjectModal';
import { CreateTaskModal } from './components/CreateTaskModal';
import { LoginScreen } from './components/LoginScreen';
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
  useProjectStatus,
  useCriticalPath,
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useDependencies,
  useCreateDependency,
  useDeleteDependency,
} from './hooks/useProjectData';
import type { Task, TaskCreate, ProjectCreate, ApiError } from './api/types';
import { notify } from './utils/notifications';
import { useUndoRedo, useUndoRedoKeyboard } from './hooks/useUndoRedo';
import { useAuth } from './hooks/useAuth';

import './index.css';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000,
      retry: 1,
    },
  },
});

// Main application wrapped with providers
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CascadeApp />
    </QueryClientProvider>
  );
}

function CascadeApp() {
  // Auth
  const { user, loading: authLoading, logout } = useAuth();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null>(null);

  // State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [linkModeSourceId, setLinkModeSourceId] = useState<string | null>(null);

  // Clear cache and reset state when user changes
  useEffect(() => {
    const currentUserId = user?.uid ?? null;
    
    if (prevUserIdRef.current !== currentUserId) {
      // User changed - clear all cached data and reset state
      queryClient.clear();
      setSelectedProjectId(null);
      setSelectedTaskId(null);
      setSearchTerm('');
    }
    prevUserIdRef.current = currentUserId;
  }, [user?.uid, queryClient]);
  
  // Modal state
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Data fetching
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: tasks = [] } = useTasks(selectedProjectId ?? undefined);
  const { data: dependencies = [] } = useDependencies(selectedProjectId ?? undefined);
  const { data: projectStatus } = useProjectStatus(selectedProjectId ?? undefined);
  const { data: criticalPath } = useCriticalPath(selectedProjectId ?? undefined);
  
  // Memoized set of critical path task IDs for O(1) lookup
  const criticalPathTaskIds = useMemo(
    () => new Set(criticalPath?.critical_path_task_ids ?? []),
    [criticalPath]
  );

  // Mutations
  const createProjectMutation = useCreateProject();
  const deleteProjectMutation = useDeleteProject();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const createDependencyMutation = useCreateDependency();
  const deleteDependencyMutation = useDeleteDependency();

  // Undo/Redo
  const { recordOperation } = useUndoRedo();
  useUndoRedoKeyboard(); // Enable Ctrl+Z / Ctrl+Shift+Z

  // Enhanced logout that clears cache immediately
  const handleLogout = useCallback(async () => {
    // Clear cache BEFORE logging out to prevent showing stale data
    queryClient.clear();
    setSelectedProjectId(null);
    setSelectedTaskId(null);
    setSearchTerm('');
    await logout();
  }, [logout, queryClient]);

  // Auto-clear selection if the selected project doesn't exist in user's projects
  useEffect(() => {
    if (selectedProjectId && projects.length > 0 && !projects.some(p => p.id === selectedProjectId)) {
      setSelectedProjectId(null);
      setSelectedTaskId(null);
    }
  }, [selectedProjectId, projects]);

  // Get selected task
  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  // Handlers
  const handleSelectProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    setSelectedTaskId(null);
  }, []);

  const handleCreateProject = useCallback(async (data: ProjectCreate) => {
    const project = await createProjectMutation.mutateAsync(data);
    setSelectedProjectId(project.id);
    notify.success(`Project "${project.name}" created`);
  }, [createProjectMutation]);

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      await deleteProjectMutation.mutateAsync(id);
      // If we deleted the selected project, clear selection
      if (selectedProjectId === id) {
        setSelectedProjectId(null);
        setSelectedTaskId(null);
      }
      notify.success('Project deleted');
    } catch (error) {
      const apiError = error as ApiError;
      notify.error(apiError.message || 'Failed to delete project');
      throw error; // Re-throw so the modal knows it failed
    }
  }, [deleteProjectMutation, selectedProjectId]);

  const handleSelectTask = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId);
  }, []);

  // Link mode handlers (mobile-friendly dependency creation)
  const handleStartLinkMode = useCallback((taskId: string) => {
    setLinkModeSourceId(taskId);
  }, []);

  const handleCancelLinkMode = useCallback(() => {
    setLinkModeSourceId(null);
  }, []);

  const handleCreateTask = useCallback(async (data: TaskCreate) => {
    const task = await createTaskMutation.mutateAsync(data);
    setSelectedTaskId(task.id);
    
    // Record for undo
    recordOperation({
      type: 'CREATE_TASK',
      undoData: null,
      redoData: task,
      description: `Create task "${task.title}"`,
    });
    
    notify.success(`Task "${task.title}" created`);
  }, [createTaskMutation, recordOperation]);

  const handleUpdateTask = useCallback(
    async (id: string, updates: Partial<Task>) => {
      // Get current task state before update for undo
      const currentTask = tasks.find(t => t.id === id);
      if (!currentTask) return;
      
      // Build previous data from current task for the fields being updated
      const previousData: Partial<Task> = {};
      for (const key of Object.keys(updates) as (keyof Task)[]) {
        previousData[key] = currentTask[key] as never;
      }
      
      try {
        await updateTaskMutation.mutateAsync({ id, data: updates });
        
        // Only record significant changes (not position updates)
        const isPositionOnly = Object.keys(updates).every(k => k === 'position_x' || k === 'position_y');
        if (!isPositionOnly) {
          recordOperation({
            type: 'UPDATE_TASK',
            undoData: { taskId: id, previousData },
            redoData: { taskId: id, newData: updates },
            description: `Update task "${currentTask.title}"`,
          });
        }
      } catch (error) {
        const apiError = error as ApiError;
        notify.error(apiError.message || 'Failed to update task');
      }
    },
    [updateTaskMutation, tasks, recordOperation]
  );

  const handleDeleteTask = useCallback(
    async (id: string) => {
      // Get task data before delete for undo
      const taskToDelete = tasks.find(t => t.id === id);
      if (!taskToDelete) return;
      
      try {
        await deleteTaskMutation.mutateAsync(id);
        setSelectedTaskId(null);
        
        // Record for undo
        recordOperation({
          type: 'DELETE_TASK',
          undoData: taskToDelete,
          redoData: null,
          description: `Delete task "${taskToDelete.title}"`,
        });
        
        notify.success('Task deleted');
      } catch (error) {
        const apiError = error as ApiError;
        notify.error(apiError.message || 'Failed to delete task');
      }
    },
    [deleteTaskMutation, tasks, recordOperation]
  );

  const handleCreateDependency = useCallback(
    async (predecessorId: string, successorId: string) => {
      try {
        const dep = await createDependencyMutation.mutateAsync({
          predecessor_id: predecessorId,
          successor_id: successorId,
        });
        
        // Get task names for description
        const predTask = tasks.find(t => t.id === predecessorId);
        const succTask = tasks.find(t => t.id === successorId);
        
        // Record for undo
        recordOperation({
          type: 'CREATE_DEPENDENCY',
          undoData: null,
          redoData: dep,
          description: `Link "${predTask?.title || 'task'}" → "${succTask?.title || 'task'}"`,
        });
        
        notify.success('Dependency created');
      } catch (error) {
        const apiError = error as ApiError;
        notify.error(apiError.message || 'Cannot create dependency', 'Dependency Error');
      }
    },
    [createDependencyMutation, tasks, recordOperation]
  );

  const handleDeleteDependency = useCallback(
    async (predecessorId: string, successorId: string) => {
      // Find the dependency for undo
      const depToDelete = dependencies.find(
        d => d.predecessor_id === predecessorId && d.successor_id === successorId
      );
      
      // Get task names for description
      const predTask = tasks.find(t => t.id === predecessorId);
      const succTask = tasks.find(t => t.id === successorId);
      
      try {
        await deleteDependencyMutation.mutateAsync({ predecessorId, successorId });
        
        // Record for undo
        if (depToDelete) {
          recordOperation({
            type: 'DELETE_DEPENDENCY',
            undoData: depToDelete,
            redoData: null,
            description: `Unlink "${predTask?.title || 'task'}" → "${succTask?.title || 'task'}"`,
          });
        }
        
        notify.success('Dependency removed');
      } catch (error) {
        const apiError = error as ApiError;
        notify.error(apiError.message || 'Failed to delete dependency');
      }
    },
    [deleteDependencyMutation, dependencies, tasks, recordOperation]
  );

  const handleUpdateTaskPosition = useCallback(
    async (taskId: string, x: number, y: number) => {
      try {
        await updateTaskMutation.mutateAsync({
          id: taskId,
          data: { position_x: x, position_y: y },
        });
        // No notification for position saves - too frequent
      } catch (error) {
        notify.error('Failed to save position');
      }
    },
    [updateTaskMutation]
  );

  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  if (projectsLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading Cascade...</p>
      </div>
    );
  }

  return (
    <>
      <AppShell
        projects={projects}
        selectedProjectId={selectedProjectId}
        projectStatus={projectStatus}
        criticalPath={criticalPath}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onSelectProject={handleSelectProject}
        onCreateProject={() => setIsProjectModalOpen(true)}
        onDeleteProject={handleDeleteProject}
        onLogout={handleLogout}
        userEmail={user?.email}
        selectedTask={selectedTask}
        tasks={tasks}
        dependencies={dependencies}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        onCreateTask={() => setIsTaskModalOpen(true)}
        linkModeSourceId={linkModeSourceId}
        onStartLinkMode={handleStartLinkMode}
        onCancelLinkMode={handleCancelLinkMode}
      >
        {selectedProjectId && projects.some(p => p.id === selectedProjectId) && (
          <FlowCanvas
            tasks={tasks}
            dependencies={dependencies}
            selectedTaskId={selectedTaskId}
            criticalPathTaskIds={criticalPathTaskIds}
            searchTerm={searchTerm}
            onSelectTask={handleSelectTask}
            onCreateDependency={handleCreateDependency}
            onDeleteDependency={handleDeleteDependency}
            onUpdateTaskPosition={handleUpdateTaskPosition}
            linkModeSourceId={linkModeSourceId}
            onStartLinkMode={handleStartLinkMode}
            onCancelLinkMode={handleCancelLinkMode}
          />
        )}
      </AppShell>

      {/* Modals */}
      <CreateProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSubmit={handleCreateProject}
      />

      {selectedProjectId && (
        <CreateTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          onSubmit={handleCreateTask}
          projectId={selectedProjectId}
        />
      )}
    </>
  );
}
