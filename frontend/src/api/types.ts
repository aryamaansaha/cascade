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
  deadline: string | null;  // ISO date string (YYYY-MM-DD)
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string | null;
  deadline?: string | null;
}

export interface ProjectUpdate {
  name?: string;
  description?: string | null;
  deadline?: string | null;
}

export interface ProjectStatus {
  project_id: string;
  deadline: string | null;
  projected_end_date: string | null;
  task_count: number;
  is_over_deadline: boolean;
  days_over: number | null;
}

export interface TaskCriticalAnalysis {
  task_id: string;
  title: string;
  duration_days: number;
  earliest_start: string;
  earliest_finish: string;
  latest_start: string;
  latest_finish: string;
  total_slack: number;
  is_critical: boolean;
}

export interface CriticalPathAnalysis {
  project_id: string;
  project_end_date: string;
  critical_path_task_ids: string[];
  task_analyses: TaskCriticalAnalysis[];
}

// =============================================================================
// What-If Simulation Types
// =============================================================================

export interface TaskChangeInput {
  task_id: string;
  start_date?: string | null;
  duration_days?: number | null;
}

export interface SimulationRequest {
  changes: TaskChangeInput[];
}

export interface TaskImpact {
  task_id: string;
  title: string;
  original_start: string;
  original_end: string;
  simulated_start: string;
  simulated_end: string;
  delta_days: number;
}

export interface SimulationResult {
  project_id: string;
  original_end_date: string;
  simulated_end_date: string;
  impact_days: number;
  affected_tasks: TaskImpact[];
  total_tasks: number;
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
  position_x: number | null; // Canvas position (null = auto-layout)
  position_y: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string | null;
  duration_days?: number;
  start_date?: string | null;
  project_id: string;
  position_x?: number | null;
  position_y?: number | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  duration_days?: number;
  start_date?: string;
  position_x?: number | null;
  position_y?: number | null;
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
  isCritical: boolean;
  isSearchMatch: boolean;
  isDimmed: boolean;
  // Link mode (mobile-friendly dependency creation)
  isLinkSource?: boolean;
  isLinkTarget?: boolean;
  [key: string]: unknown;
}
