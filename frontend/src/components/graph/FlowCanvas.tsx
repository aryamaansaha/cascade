/**
 * Main ReactFlow canvas component for displaying the task DAG.
 * 
 * Handles:
 * - Rendering tasks as custom nodes
 * - Rendering dependencies as edges
 * - Node selection
 * - Creating new dependencies (edge connections)
 * - Persisting node positions
 */

import { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TaskNode } from './TaskNode';
import type { Task, Dependency, TaskNodeData } from '../../api/types';
import './FlowCanvas.css';

// Register custom node types
const nodeTypes: NodeTypes = {
  task: TaskNode,
};

// Auto-layout constants
const GRID_COLS = 4;
const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;
const GAP_X = 80;
const GAP_Y = 60;

interface FlowCanvasProps {
  tasks: Task[];
  dependencies: Dependency[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
  onCreateDependency: (predecessorId: string, successorId: string) => void;
  onUpdateTaskPosition: (taskId: string, x: number, y: number) => void;
}

/**
 * Calculate auto-layout position for a task based on index
 */
function getAutoLayoutPosition(index: number): { x: number; y: number } {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return {
    x: col * (NODE_WIDTH + GAP_X) + 50,
    y: row * (NODE_HEIGHT + GAP_Y) + 50,
  };
}

/**
 * Convert tasks to ReactFlow nodes, using stored positions if available
 */
function tasksToNodes(tasks: Task[], selectedTaskId: string | null): Node<TaskNodeData>[] {
  return tasks.map((task, index) => {
    // Use stored position if available, otherwise auto-layout
    const position = (task.position_x !== null && task.position_y !== null)
      ? { x: task.position_x, y: task.position_y }
      : getAutoLayoutPosition(index);
    
    return {
      id: task.id,
      type: 'task',
      position,
      data: {
        task,
        isSelected: task.id === selectedTaskId,
      } as TaskNodeData,
      selected: task.id === selectedTaskId,
    };
  });
}

/**
 * Convert dependencies to ReactFlow edges
 */
function dependenciesToEdges(dependencies: Dependency[]): Edge[] {
  return dependencies.map((dep) => ({
    id: `${dep.predecessor_id}-${dep.successor_id}`,
    source: dep.predecessor_id,
    target: dep.successor_id,
    type: 'smoothstep',
    animated: false,
    style: {
      strokeWidth: 2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
  }));
}

export function FlowCanvas({
  tasks,
  dependencies,
  selectedTaskId,
  onSelectTask,
  onCreateDependency,
  onUpdateTaskPosition,
}: FlowCanvasProps) {
  // Track task IDs to detect additions/removals
  const prevTaskIdsRef = useRef<Set<string>>(new Set());
  
  // Convert data to ReactFlow format
  const initialNodes = useMemo(
    () => tasksToNodes(tasks, selectedTaskId),
    [tasks, selectedTaskId]
  );
  
  const initialEdges = useMemo(
    () => dependenciesToEdges(dependencies),
    [dependencies]
  );

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when tasks change, but preserve positions for existing nodes
  useEffect(() => {
    const currentTaskIds = new Set(tasks.map(t => t.id));
    const prevTaskIds = prevTaskIdsRef.current;
    
    // Check if tasks were added or removed
    const tasksChanged = 
      currentTaskIds.size !== prevTaskIds.size ||
      tasks.some(t => !prevTaskIds.has(t.id));
    
    if (tasksChanged) {
      // Tasks were added/removed - do a full reset
      setNodes(tasksToNodes(tasks, selectedTaskId) as Node[]);
    } else {
      // Only task data changed - update data but preserve positions
      setNodes(currentNodes => 
        currentNodes.map(node => {
          const task = tasks.find(t => t.id === node.id);
          if (!task) return node;
          
          return {
            ...node,
            data: {
              task,
              isSelected: task.id === selectedTaskId,
            } as TaskNodeData,
            selected: task.id === selectedTaskId,
          };
        })
      );
    }
    
    prevTaskIdsRef.current = currentTaskIds;
  }, [tasks, selectedTaskId, setNodes]);

  // Update edges when dependencies change
  useEffect(() => {
    setEdges(dependenciesToEdges(dependencies));
  }, [dependencies, setEdges]);

  // Handle node drag end - save position to backend
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onUpdateTaskPosition(node.id, node.position.x, node.position.y);
    },
    [onUpdateTaskPosition]
  );

  // Handle node selection
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectTask(node.id);
    },
    [onSelectTask]
  );

  // Handle background click (deselect)
  const onPaneClick = useCallback(() => {
    onSelectTask(null);
  }, [onSelectTask]);

  // Handle new edge connections (create dependency)
  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (connection.source && connection.target) {
        onCreateDependency(connection.source, connection.target);
      }
    },
    [onCreateDependency]
  );

  return (
    <div className="flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 2 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--grid-color)"
        />
        <Controls className="flow-controls" />
        <MiniMap
          className="flow-minimap"
          nodeColor={(node) => {
            if (node.selected) return 'var(--accent-primary)';
            return 'var(--node-bg)';
          }}
          maskColor="rgba(0, 0, 0, 0.2)"
        />
      </ReactFlow>
    </div>
  );
}

export default FlowCanvas;
