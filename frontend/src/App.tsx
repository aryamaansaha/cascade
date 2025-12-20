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
import {
  useProjects,
  useCreateProject,
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useDependencies,
  useCreateDependency,
} from './hooks/useProjectData';
import type { Task, ApiError } from './api/types';

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

  // Data fetching
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: tasks = [] } = useTasks(selectedProjectId ?? undefined);
  const { data: dependencies = [] } = useDependencies(selectedProjectId ?? undefined);

  // Mutations
  const createProjectMutation = useCreateProject();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const createDependencyMutation = useCreateDependency();

  // Get selected task
  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  // Handlers
  const handleSelectProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    setSelectedTaskId(null);
  }, []);

  const handleCreateProject = useCallback(async () => {
    const name = prompt('Enter project name:');
    if (name) {
      try {
        const project = await createProjectMutation.mutateAsync({ name });
        setSelectedProjectId(project.id);
      } catch (error) {
        const apiError = error as ApiError;
        alert(`Failed to create project: ${apiError.message}`);
      }
    }
  }, [createProjectMutation]);

  const handleSelectTask = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleCreateTask = useCallback(async () => {
    if (!selectedProjectId) return;

    const title = prompt('Enter task title:');
    if (title) {
      try {
        const task = await createTaskMutation.mutateAsync({
          title,
          project_id: selectedProjectId,
          duration_days: 1,
        });
        setSelectedTaskId(task.id);
      } catch (error) {
        const apiError = error as ApiError;
        alert(`Failed to create task: ${apiError.message}`);
      }
    }
  }, [selectedProjectId, createTaskMutation]);

  const handleUpdateTask = useCallback(
    async (id: string, updates: Partial<Task>) => {
      try {
        await updateTaskMutation.mutateAsync({ id, data: updates });
      } catch (error) {
        const apiError = error as ApiError;
        alert(`Failed to update task: ${apiError.message}`);
      }
    },
    [updateTaskMutation]
  );

  const handleDeleteTask = useCallback(
    async (id: string) => {
      try {
        await deleteTaskMutation.mutateAsync(id);
        setSelectedTaskId(null);
      } catch (error) {
        const apiError = error as ApiError;
        alert(`Failed to delete task: ${apiError.message}`);
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
      } catch (error) {
        const apiError = error as ApiError;
        alert(`Cannot create dependency: ${apiError.message}`);
      }
    },
    [createDependencyMutation]
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
    <AppShell
      projects={projects}
      selectedProjectId={selectedProjectId}
      onSelectProject={handleSelectProject}
      onCreateProject={handleCreateProject}
      selectedTask={selectedTask}
      onUpdateTask={handleUpdateTask}
      onDeleteTask={handleDeleteTask}
      onCreateTask={handleCreateTask}
    >
      {selectedProjectId && (
        <FlowCanvas
          tasks={tasks}
          dependencies={dependencies}
          selectedTaskId={selectedTaskId}
          onSelectTask={handleSelectTask}
          onCreateDependency={handleCreateDependency}
        />
      )}
    </AppShell>
  );
}
