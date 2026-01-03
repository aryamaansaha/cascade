/**
 * Scheduling utilities for calculating task constraints.
 */

import type { Task, Dependency } from '../api/types';

/**
 * Calculate the earliest valid start date for a task based on its predecessors.
 * 
 * Formula: earliest = max(predecessor.end_date) + 1 day
 * 
 * @param taskId - The task to calculate for
 * @param tasks - All tasks in the project
 * @param dependencies - All dependencies in the project
 * @returns The earliest valid start date, or null if task has no predecessors
 */
export function getEarliestStartDate(
  taskId: string,
  tasks: Task[],
  dependencies: Dependency[]
): string | null {
  // Find all predecessors of this task
  const predecessorIds = dependencies
    .filter(d => d.successor_id === taskId)
    .map(d => d.predecessor_id);
  
  if (predecessorIds.length === 0) {
    return null; // No predecessors = user controls the date
  }
  
  // Get predecessor tasks
  const predecessors = tasks.filter(t => predecessorIds.includes(t.id));
  
  if (predecessors.length === 0) {
    return null; // Predecessors not found (shouldn't happen)
  }
  
  // Find the latest end date among predecessors
  const latestEnd = predecessors.reduce((latest, pred) => {
    return pred.end_date > latest ? pred.end_date : latest;
  }, predecessors[0].end_date);
  
  // Earliest start is the day after the latest predecessor ends
  const latestEndDate = new Date(latestEnd + 'T00:00:00');
  latestEndDate.setDate(latestEndDate.getDate() + 1);
  
  // Return as ISO date string (YYYY-MM-DD)
  return latestEndDate.toISOString().split('T')[0];
}

/**
 * Check if a task's current start date violates its dependency constraint.
 * 
 * @param task - The task to check
 * @param tasks - All tasks in the project
 * @param dependencies - All dependencies in the project
 * @returns true if the task's date is before its earliest valid date
 */
export function isDateConstrained(
  task: Task,
  tasks: Task[],
  dependencies: Dependency[]
): boolean {
  const earliest = getEarliestStartDate(task.id, tasks, dependencies);
  if (!earliest) return false;
  return task.start_date < earliest;
}

/**
 * Format a date for display (e.g., "Jan 6, 2026")
 */
export function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

