/**
 * Undo/Redo system for Cascade.
 * 
 * Tracks operations and provides ability to undo/redo them.
 * Works with the mutation system to reverse database operations.
 */

import { useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { taskApi, dependencyApi } from '../api/client';
import type { Task, Dependency } from '../api/types';
import { notify } from '../utils/notifications';

// Operation types that can be undone
type OperationType = 
  | 'CREATE_TASK'
  | 'UPDATE_TASK'
  | 'DELETE_TASK'
  | 'CREATE_DEPENDENCY'
  | 'DELETE_DEPENDENCY';

interface UndoableOperation {
  id: string;
  type: OperationType;
  timestamp: number;
  // Data needed to undo the operation
  undoData: unknown;
  // Data needed to redo the operation
  redoData: unknown;
  // Human-readable description
  description: string;
}

// Max operations to keep in history
const MAX_HISTORY = 50;

// Global history stacks (persists across re-renders)
let undoStack: UndoableOperation[] = [];
let redoStack: UndoableOperation[] = [];
let listeners: Set<() => void> = new Set();

function notifyListeners() {
  listeners.forEach(fn => fn());
}

/**
 * Hook for undo/redo functionality.
 */
export function useUndoRedo() {
  const queryClient = useQueryClient();
  const isUndoingRef = useRef(false);

  // Subscribe to history changes for re-renders
  useEffect(() => {
    const forceUpdate = () => {};
    listeners.add(forceUpdate);
    return () => { listeners.delete(forceUpdate); };
  }, []);

  /**
   * Record an operation that can be undone.
   */
  const recordOperation = useCallback((op: Omit<UndoableOperation, 'id' | 'timestamp'>) => {
    // Don't record if we're in the middle of undoing/redoing
    if (isUndoingRef.current) return;

    const operation: UndoableOperation = {
      ...op,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    undoStack.push(operation);
    
    // Trim old entries
    if (undoStack.length > MAX_HISTORY) {
      undoStack = undoStack.slice(-MAX_HISTORY);
    }
    
    // Clear redo stack when new operation is recorded
    redoStack = [];
    
    notifyListeners();
  }, []);

  /**
   * Undo the last operation.
   */
  const undo = useCallback(async () => {
    const operation = undoStack.pop();
    if (!operation) {
      notify.info('Nothing to undo');
      return;
    }

    isUndoingRef.current = true;

    try {
      switch (operation.type) {
        case 'CREATE_TASK': {
          // Undo create = delete the task
          const task = operation.redoData as Task;
          await taskApi.delete(task.id);
          break;
        }
        case 'UPDATE_TASK': {
          // Undo update = restore previous values
          const { taskId, previousData } = operation.undoData as { 
            taskId: string; 
            previousData: Partial<Task>;
          };
          await taskApi.update(taskId, previousData);
          break;
        }
        case 'DELETE_TASK': {
          // Undo delete = recreate the task
          const deletedTask = operation.undoData as Task;
          await taskApi.create({
            title: deletedTask.title,
            description: deletedTask.description,
            duration_days: deletedTask.duration_days,
            start_date: deletedTask.start_date,
            project_id: deletedTask.project_id,
            position_x: deletedTask.position_x,
            position_y: deletedTask.position_y,
          });
          break;
        }
        case 'CREATE_DEPENDENCY': {
          // Undo create dependency = delete it
          const dep = operation.redoData as Dependency;
          await dependencyApi.delete(dep.predecessor_id, dep.successor_id);
          break;
        }
        case 'DELETE_DEPENDENCY': {
          // Undo delete dependency = recreate it
          const dep = operation.undoData as Dependency;
          await dependencyApi.create({
            predecessor_id: dep.predecessor_id,
            successor_id: dep.successor_id,
          });
          break;
        }
      }

      // Move to redo stack
      redoStack.push(operation);
      
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      
      notify.success(`Undid: ${operation.description}`);
    } catch (error) {
      // Put operation back if undo failed
      undoStack.push(operation);
      notify.error('Failed to undo');
      console.error('Undo failed:', error);
    } finally {
      isUndoingRef.current = false;
      notifyListeners();
    }
  }, [queryClient]);

  /**
   * Redo the last undone operation.
   */
  const redo = useCallback(async () => {
    const operation = redoStack.pop();
    if (!operation) {
      notify.info('Nothing to redo');
      return;
    }

    isUndoingRef.current = true;

    try {
      switch (operation.type) {
        case 'CREATE_TASK': {
          // Redo create = create the task again
          const task = operation.redoData as Task;
          await taskApi.create({
            title: task.title,
            description: task.description,
            duration_days: task.duration_days,
            start_date: task.start_date,
            project_id: task.project_id,
            position_x: task.position_x,
            position_y: task.position_y,
          });
          break;
        }
        case 'UPDATE_TASK': {
          // Redo update = apply the new values again
          const { taskId, newData } = operation.redoData as {
            taskId: string;
            newData: Partial<Task>;
          };
          await taskApi.update(taskId, newData);
          break;
        }
        case 'DELETE_TASK': {
          // Redo delete = delete the task again
          const task = operation.undoData as Task;
          await taskApi.delete(task.id);
          break;
        }
        case 'CREATE_DEPENDENCY': {
          // Redo create dependency = create it again
          const dep = operation.redoData as Dependency;
          await dependencyApi.create({
            predecessor_id: dep.predecessor_id,
            successor_id: dep.successor_id,
          });
          break;
        }
        case 'DELETE_DEPENDENCY': {
          // Redo delete dependency = delete it again
          const dep = operation.undoData as Dependency;
          await dependencyApi.delete(dep.predecessor_id, dep.successor_id);
          break;
        }
      }

      // Move back to undo stack
      undoStack.push(operation);
      
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      
      notify.success(`Redid: ${operation.description}`);
    } catch (error) {
      // Put operation back if redo failed
      redoStack.push(operation);
      notify.error('Failed to redo');
      console.error('Redo failed:', error);
    } finally {
      isUndoingRef.current = false;
      notifyListeners();
    }
  }, [queryClient]);

  /**
   * Clear all history.
   */
  const clearHistory = useCallback(() => {
    undoStack = [];
    redoStack = [];
    notifyListeners();
  }, []);

  return {
    recordOperation,
    undo,
    redo,
    clearHistory,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoDescription: undoStack[undoStack.length - 1]?.description,
    redoDescription: redoStack[redoStack.length - 1]?.description,
  };
}

/**
 * Hook to set up global keyboard shortcuts for undo/redo.
 */
export function useUndoRedoKeyboard() {
  const { undo, redo } = useUndoRedo();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
      const isMod = e.ctrlKey || e.metaKey;
      
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (isMod && e.key === 'z' && e.shiftKey) {
        // Ctrl+Shift+Z for redo
        e.preventDefault();
        redo();
      } else if (isMod && e.key === 'y') {
        // Ctrl+Y for redo (Windows convention)
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);
}

