/**
 * React Query hooks for fetching and mutating project data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectApi, taskApi, dependencyApi } from '../api/client';
import type {
  ProjectCreate,
  ProjectUpdate,
  TaskCreate,
  TaskUpdate,
  DependencyCreate,
} from '../api/types';

// =============================================================================
// Query Keys
// =============================================================================

export const queryKeys = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  tasks: (projectId?: string) => ['tasks', { projectId }] as const,
  task: (id: string) => ['tasks', id] as const,
  dependencies: (projectId?: string) => ['dependencies', { projectId }] as const,
};

// =============================================================================
// Project Hooks
// =============================================================================

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: projectApi.list,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => projectApi.get(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProjectCreate) => projectApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectUpdate }) =>
      projectApi.update(id, data),
    onSuccess: (updatedProject) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.setQueryData(queryKeys.project(updatedProject.id), updatedProject);
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// =============================================================================
// Task Hooks
// =============================================================================

export function useTasks(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.tasks(projectId),
    queryFn: () => taskApi.list(projectId),
    // Poll every 2 seconds for updates from background recalculation
    refetchInterval: 2000,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: queryKeys.task(id),
    queryFn: () => taskApi.get(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TaskCreate) => taskApi.create(data),
    onSuccess: (newTask) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(newTask.project_id) });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdate }) =>
      taskApi.update(id, data),
    onSuccess: (updatedTask) => {
      // Invalidate task list to trigger refetch (will pick up cascade changes)
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(updatedTask.project_id) });
      queryClient.setQueryData(queryKeys.task(updatedTask.id), updatedTask);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => taskApi.delete(id),
    onSuccess: () => {
      // Invalidate all tasks since deletion affects the graph
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
    },
  });
}

// =============================================================================
// Dependency Hooks
// =============================================================================

export function useDependencies(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.dependencies(projectId),
    queryFn: () => dependencyApi.list(projectId),
    // Also poll to catch any dependency changes
    refetchInterval: 2000,
  });
}

export function useCreateDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DependencyCreate) => dependencyApi.create(data),
    onSuccess: () => {
      // Invalidate dependencies and tasks (dates may have changed)
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ predecessorId, successorId }: { predecessorId: string; successorId: string }) =>
      dependencyApi.delete(predecessorId, successorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
