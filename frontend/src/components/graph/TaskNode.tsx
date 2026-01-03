/**
 * Custom ReactFlow node for displaying tasks.
 * 
 * Features:
 * - Shows task title, duration, and date range
 * - Color-coded left border
 * - Selection state styling
 * - Input/Output handles for dependencies
 */

import { Handle, Position, type Node } from '@xyflow/react';
import type { TaskNodeData } from '../../api/types';
import './TaskNode.css';

// Define the node props type for our custom node
type TaskNodeProps = {
  data: TaskNodeData;
  selected?: boolean;
};

export function TaskNode({ data, selected }: TaskNodeProps) {
  const { task, isCritical } = data;
  
  // Format date for display (e.g., "Dec 19")
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const nodeClasses = [
    'task-node',
    selected ? 'selected' : '',
    isCritical ? 'critical' : '',
  ].filter(Boolean).join(' ');
  
  return (
    <div className={nodeClasses}>
      {/* Input handle (left) - tasks can have dependencies */}
      <Handle
        type="target"
        position={Position.Left}
        className="task-handle task-handle-input"
      />
      
      <div className="task-node-content">
        <div className="task-node-header">
          <span className="task-title">{task.title}</span>
          {isCritical && <span className="critical-badge" title="Critical Path">⚡</span>}
        </div>
        
        <div className="task-node-body">
          <div className="task-duration">
            {task.duration_days === 0 ? (
              <span className="milestone-badge">Milestone</span>
            ) : (
              <span>{task.duration_days} {task.duration_days === 1 ? 'day' : 'days'}</span>
            )}
          </div>
          
          <div className="task-dates">
            {formatDate(task.start_date)}
            {task.start_date !== task.end_date && (
              <>
                <span className="date-separator">→</span>
                {formatDate(task.end_date)}
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Output handle (right) - this task can block others */}
      <Handle
        type="source"
        position={Position.Right}
        className="task-handle task-handle-output"
      />
    </div>
  );
}

// Export the node type for registration
export type TaskNodeType = Node<TaskNodeData, 'task'>;

export default TaskNode;
