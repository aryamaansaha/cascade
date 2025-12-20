/**
 * TypeScript types matching the backend Pydantic schemas.
 * Keep these in sync with backend/app/schemas/*.py
 */

// =============================================================================
// Project Types
// =============================================================================

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string | null;
}

export interface ProjectUpdate {
  name?: string;
  description?: string | null;
}

// =============================================================================
// Task Types
// =============================================================================

export interface Task {
  id: string;
  title: string;
  description: string | null;
  duration_days: number;
  start_date: string; // ISO date string (YYYY-MM-DD)
  end_date: string;   // Computed by backend
  calc_version_id: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string | null;
  duration_days?: number;
  start_date?: string | null;
  project_id: string;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  duration_days?: number;
  start_date?: string;
}

// =============================================================================
// Dependency Types
// =============================================================================

export interface Dependency {
  predecessor_id: string;
  successor_id: string;
  created_at: string;
}

export interface DependencyCreate {
  predecessor_id: string;
  successor_id: string;
}

// =============================================================================
// API Error Response
// =============================================================================

export interface ApiError {
  error: string;
  message: string;
  details: Array<{
    loc: string[];
    msg: string;
    type: string;
  }> | null;
}

// =============================================================================
// ReactFlow Node Data Types
// =============================================================================

// Note: ReactFlow requires node data to be Record<string, unknown> compatible
// We use an interface that extends this pattern
export interface TaskNodeData {
  task: Task;
  isSelected: boolean;
  [key: string]: unknown;
}
