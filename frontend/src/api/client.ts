/**
 * API client for communicating with the Cascade backend.
 */

import axios, { AxiosError } from 'axios';
import type {
  Project,
  ProjectCreate,
  ProjectUpdate,
  ProjectStatus,
  CriticalPathAnalysis,
  SimulationRequest,
  SimulationResult,
  Task,
  TaskCreate,
  TaskUpdate,
  Dependency,
  DependencyCreate,
  ApiError,
} from './types';

// Base API client
const api = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Error handler helper
function handleApiError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiError>;
    if (axiosError.response?.data) {
      throw axiosError.response.data;
    }
  }
  throw error;
}

// =============================================================================
// Project API
// =============================================================================

export const projectApi = {
  list: async (): Promise<Project[]> => {
    const response = await api.get<Project[]>('/projects/');
    return response.data;
  },

  get: async (id: string): Promise<Project> => {
    const response = await api.get<Project>(`/projects/${id}`);
    return response.data;
  },

  create: async (data: ProjectCreate): Promise<Project> => {
    try {
      const response = await api.post<Project>('/projects/', data);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  update: async (id: string, data: ProjectUpdate): Promise<Project> => {
    try {
      const response = await api.patch<Project>(`/projects/${id}`, data);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/projects/${id}`);
  },

  getStatus: async (id: string): Promise<ProjectStatus> => {
    const response = await api.get<ProjectStatus>(`/projects/${id}/status`);
    return response.data;
  },

  getCriticalPath: async (id: string): Promise<CriticalPathAnalysis> => {
    const response = await api.get<CriticalPathAnalysis>(`/projects/${id}/critical-path`);
    return response.data;
  },

  simulate: async (id: string, request: SimulationRequest): Promise<SimulationResult> => {
    const response = await api.post<SimulationResult>(`/projects/${id}/simulate`, request);
    return response.data;
  },
};

// =============================================================================
// Task API
// =============================================================================

export const taskApi = {
  list: async (projectId?: string): Promise<Task[]> => {
    const params = projectId ? { project_id: projectId } : {};
    const response = await api.get<Task[]>('/tasks/', { params });
    return response.data;
  },

  get: async (id: string): Promise<Task> => {
    const response = await api.get<Task>(`/tasks/${id}`);
    return response.data;
  },

  create: async (data: TaskCreate): Promise<Task> => {
    try {
      const response = await api.post<Task>('/tasks/', data);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  update: async (id: string, data: TaskUpdate): Promise<Task> => {
    try {
      const response = await api.patch<Task>(`/tasks/${id}`, data);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/tasks/${id}`);
  },
};

// =============================================================================
// Dependency API
// =============================================================================

export const dependencyApi = {
  list: async (projectId?: string, taskId?: string): Promise<Dependency[]> => {
    const params: Record<string, string> = {};
    if (projectId) params.project_id = projectId;
    if (taskId) params.task_id = taskId;
    const response = await api.get<Dependency[]>('/dependencies/', { params });
    return response.data;
  },

  create: async (data: DependencyCreate): Promise<Dependency> => {
    try {
      const response = await api.post<Dependency>('/dependencies/', data);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  delete: async (predecessorId: string, successorId: string): Promise<void> => {
    await api.delete(`/dependencies/${predecessorId}/${successorId}`);
  },
};

export default api;

