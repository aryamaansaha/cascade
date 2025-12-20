/**
 * Main ReactFlow canvas component for displaying the task DAG.
 * 
 * Handles:
 * - Rendering tasks as custom nodes
 * - Rendering dependencies as edges
 * - Node selection
 * - Creating new dependencies (edge connections)
 * - Auto-layout positioning
 */

import { useCallback, useMemo, useEffect } from 'react';
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

interface FlowCanvasProps {
  tasks: Task[];
  dependencies: Dependency[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
  onCreateDependency: (predecessorId: string, successorId: string) => void;
}

/**
 * Convert tasks to ReactFlow nodes
 */
function tasksToNodes(tasks: Task[], selectedTaskId: string | null): Node<TaskNodeData>[] {
  // Simple grid layout - we'll position nodes based on their index
  // A proper implementation would use dagre or elk for auto-layout
  const GRID_COLS = 4;
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 100;
  const GAP_X = 80;
  const GAP_Y = 60;
  
  return tasks.map((task, index) => {
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    
    return {
      id: task.id,
      type: 'task',
      position: {
        x: col * (NODE_WIDTH + GAP_X) + 50,
        y: row * (NODE_HEIGHT + GAP_Y) + 50,
      },
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
}: FlowCanvasProps) {
  // Convert data to ReactFlow format
  const initialNodes = useMemo(
    () => tasksToNodes(tasks, selectedTaskId),
    [tasks, selectedTaskId]
  );
  
  const initialEdges = useMemo(
    () => dependenciesToEdges(dependencies),
    [dependencies]
  );

  // ReactFlow state - use generic Node/Edge types
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when tasks change
  useEffect(() => {
    setNodes(tasksToNodes(tasks, selectedTaskId) as Node[]);
  }, [tasks, selectedTaskId, setNodes]);

  // Update edges when dependencies change
  useEffect(() => {
    setEdges(dependenciesToEdges(dependencies));
  }, [dependencies, setEdges]);

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
        // Call API to create dependency
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
