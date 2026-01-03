/**
 * Main Cascade application component.
 * 
 * Orchestrates:
 * - Project selection and management
 * - Task graph visualization
 * - Task editing via the inspector
 */

import { useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppShell } from './components/layout/AppShell';
import { FlowCanvas } from './components/graph/FlowCanvas';
import { CreateProjectModal } from './components/CreateProjectModal';
import { CreateTaskModal } from './components/CreateTaskModal';
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
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
  // State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // Modal state
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Data fetching
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: tasks = [] } = useTasks(selectedProjectId ?? undefined);
  const { data: dependencies = [] } = useDependencies(selectedProjectId ?? undefined);

  // Mutations
  const createProjectMutation = useCreateProject();
  const deleteProjectMutation = useDeleteProject();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const createDependencyMutation = useCreateDependency();
  const deleteDependencyMutation = useDeleteDependency();

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

  const handleCreateTask = useCallback(async (data: TaskCreate) => {
    const task = await createTaskMutation.mutateAsync(data);
    setSelectedTaskId(task.id);
    notify.success(`Task "${task.title}" created`);
  }, [createTaskMutation]);

  const handleUpdateTask = useCallback(
    async (id: string, updates: Partial<Task>) => {
      try {
        await updateTaskMutation.mutateAsync({ id, data: updates });
      } catch (error) {
        const apiError = error as ApiError;
        notify.error(apiError.message || 'Failed to update task');
      }
    },
    [updateTaskMutation]
  );

  const handleDeleteTask = useCallback(
    async (id: string) => {
      try {
        await deleteTaskMutation.mutateAsync(id);
        setSelectedTaskId(null);
        notify.success('Task deleted');
      } catch (error) {
        const apiError = error as ApiError;
        notify.error(apiError.message || 'Failed to delete task');
      }
    },
    [deleteTaskMutation]
  );

  const handleCreateDependency = useCallback(
    async (predecessorId: string, successorId: string) => {
      try {
        await createDependencyMutation.mutateAsync({
          predecessor_id: predecessorId,
          successor_id: successorId,
        });
        notify.success('Dependency created');
      } catch (error) {
        const apiError = error as ApiError;
        notify.error(apiError.message || 'Cannot create dependency', 'Dependency Error');
      }
    },
    [createDependencyMutation]
  );

  const handleDeleteDependency = useCallback(
    async (predecessorId: string, successorId: string) => {
      try {
        await deleteDependencyMutation.mutateAsync({ predecessorId, successorId });
        notify.success('Dependency removed');
      } catch (error) {
        const apiError = error as ApiError;
        notify.error(apiError.message || 'Failed to delete dependency');
      }
    },
    [deleteDependencyMutation]
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
        onSelectProject={handleSelectProject}
        onCreateProject={() => setIsProjectModalOpen(true)}
        onDeleteProject={handleDeleteProject}
        selectedTask={selectedTask}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        onCreateTask={() => setIsTaskModalOpen(true)}
      >
        {selectedProjectId && (
          <FlowCanvas
            tasks={tasks}
            dependencies={dependencies}
            selectedTaskId={selectedTaskId}
            onSelectTask={handleSelectTask}
            onCreateDependency={handleCreateDependency}
            onDeleteDependency={handleDeleteDependency}
            onUpdateTaskPosition={handleUpdateTaskPosition}
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
