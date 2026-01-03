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

import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
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
  criticalPathTaskIds: Set<string>;
  searchTerm: string;
  onSelectTask: (taskId: string | null) => void;
  onCreateDependency: (predecessorId: string, successorId: string) => void;
  onDeleteDependency: (predecessorId: string, successorId: string) => void;
  onUpdateTaskPosition: (taskId: string, x: number, y: number) => void;
  // Link mode - for mobile-friendly dependency creation
  linkModeSourceId: string | null;
  onStartLinkMode: (taskId: string) => void;
  onCancelLinkMode: () => void;
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
 * Check if a task matches the search term
 */
function taskMatchesSearch(task: Task, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  const term = searchTerm.toLowerCase();
  return (
    task.title.toLowerCase().includes(term) ||
    (task.description?.toLowerCase().includes(term) ?? false)
  );
}

/**
 * Convert tasks to ReactFlow nodes, using stored positions if available
 */
function tasksToNodes(
  tasks: Task[],
  selectedTaskId: string | null,
  criticalPathTaskIds: Set<string>,
  searchTerm: string,
  linkModeSourceId: string | null = null
): Node<TaskNodeData>[] {
  const hasSearch = searchTerm.trim().length > 0;
  const isInLinkMode = linkModeSourceId !== null;
  
  return tasks.map((task, index) => {
    // Use stored position if available, otherwise auto-layout
    const position = (task.position_x !== null && task.position_y !== null)
      ? { x: task.position_x, y: task.position_y }
      : getAutoLayoutPosition(index);
    
    const isSearchMatch = taskMatchesSearch(task, searchTerm);
    const isLinkSource = task.id === linkModeSourceId;
    const isLinkTarget = isInLinkMode && !isLinkSource;
    
    return {
      id: task.id,
      type: 'task',
      position,
      data: {
        task,
        isSelected: task.id === selectedTaskId,
        isCritical: criticalPathTaskIds.has(task.id),
        isSearchMatch,
        isDimmed: hasSearch && !isSearchMatch,
        isLinkSource,
        isLinkTarget,
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
    id: `${dep.predecessor_id}::${dep.successor_id}`,
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

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <div className="flow-canvas">
      <ReactFlowProvider>
        <FlowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

function FlowCanvasInner({
  tasks,
  dependencies,
  selectedTaskId,
  criticalPathTaskIds,
  searchTerm,
  onSelectTask,
  onCreateDependency,
  onDeleteDependency,
  onUpdateTaskPosition,
  linkModeSourceId,
  onStartLinkMode,
  onCancelLinkMode,
}: FlowCanvasProps) {
  // Track task IDs to detect additions/removals
  const prevTaskIdsRef = useRef<Set<string>>(new Set());
  const selectedEdgeRef = useRef<string | null>(null);
  const { fitView } = useReactFlow();
  
  // Convert data to ReactFlow format
  const initialNodes = useMemo(
    () => tasksToNodes(tasks, selectedTaskId, criticalPathTaskIds, searchTerm, linkModeSourceId),
    [tasks, selectedTaskId, criticalPathTaskIds, searchTerm, linkModeSourceId]
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
    const hasSearch = searchTerm.trim().length > 0;
    const isInLinkMode = linkModeSourceId !== null;
    
    // Check if tasks were added or removed
    const tasksChanged = 
      currentTaskIds.size !== prevTaskIds.size ||
      tasks.some(t => !prevTaskIds.has(t.id));
    
    if (tasksChanged) {
      // Tasks were added/removed - do a full reset
      setNodes(tasksToNodes(tasks, selectedTaskId, criticalPathTaskIds, searchTerm, linkModeSourceId) as Node[]);
      // Fit view after a short delay to ensure nodes are rendered
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    } else {
      // Only task data changed - update data but preserve positions
      setNodes(currentNodes => 
        currentNodes.map(node => {
          const task = tasks.find(t => t.id === node.id);
          if (!task) return node;
          
          const isSearchMatch = taskMatchesSearch(task, searchTerm);
          const isLinkSource = task.id === linkModeSourceId;
          const isLinkTarget = isInLinkMode && !isLinkSource;
          
          return {
            ...node,
            data: {
              task,
              isSelected: task.id === selectedTaskId,
              isCritical: criticalPathTaskIds.has(task.id),
              isSearchMatch,
              isDimmed: hasSearch && !isSearchMatch,
              isLinkSource,
              isLinkTarget,
            } as TaskNodeData,
            selected: task.id === selectedTaskId,
          };
        })
      );
    }
    
    prevTaskIdsRef.current = currentTaskIds;
  }, [tasks, selectedTaskId, criticalPathTaskIds, searchTerm, linkModeSourceId, setNodes, fitView]);

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

  // Handle node selection (or link completion in link mode)
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (linkModeSourceId) {
        // In link mode - create dependency and exit link mode
        if (node.id !== linkModeSourceId) {
          onCreateDependency(linkModeSourceId, node.id);
        }
        onCancelLinkMode();
      } else {
        // Normal mode - just select
        onSelectTask(node.id);
      }
    },
    [onSelectTask, linkModeSourceId, onCreateDependency, onCancelLinkMode]
  );

  // Handle new edge connections (create dependency)
  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (connection.source && connection.target) {
        onCreateDependency(connection.source, connection.target);
      }
    },
    [onCreateDependency]
  );

  // Handle edge click (select edge)
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      selectedEdgeRef.current = edge.id;
      // Update edge styles to show selection
      setEdges(currentEdges =>
        currentEdges.map(e => ({
          ...e,
          selected: e.id === edge.id,
          style: {
            ...e.style,
            strokeWidth: e.id === edge.id ? 3 : 2,
            stroke: e.id === edge.id ? 'var(--danger)' : undefined,
          },
        }))
      );
      // Deselect any selected task
      onSelectTask(null);
    },
    [setEdges, onSelectTask]
  );

  // Handle keyboard events for edge deletion and link mode cancellation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape key cancels link mode
      if (event.key === 'Escape' && linkModeSourceId) {
        onCancelLinkMode();
        return;
      }
      
      // Delete/Backspace deletes selected edge
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeRef.current) {
        const edgeId = selectedEdgeRef.current;
        const [predecessorId, successorId] = edgeId.split('::');
        if (predecessorId && successorId) {
          onDeleteDependency(predecessorId, successorId);
          selectedEdgeRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeleteDependency, linkModeSourceId, onCancelLinkMode]);

  // Clear edge selection when clicking on pane (and cancel link mode)
  const handlePaneClick = useCallback(() => {
    // Cancel link mode if active
    if (linkModeSourceId) {
      onCancelLinkMode();
    }
    
    selectedEdgeRef.current = null;
    setEdges(currentEdges =>
      currentEdges.map(e => ({
        ...e,
        selected: false,
        style: {
          ...e.style,
          strokeWidth: 2,
          stroke: undefined,
        },
      }))
    );
    onSelectTask(null);
  }, [setEdges, onSelectTask, linkModeSourceId, onCancelLinkMode]);

  return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={40}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 2 },
        }}
        connectionLineStyle={{
          strokeWidth: 2,
          stroke: 'var(--accent-primary)',
        }}
        deleteKeyCode={null}
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
          const data = node.data as TaskNodeData;
          if (data?.isCritical) return 'var(--danger)';
            return 'var(--node-bg)';
          }}
          maskColor="rgba(0, 0, 0, 0.2)"
        />
      </ReactFlow>
  );
}

export default FlowCanvas;
