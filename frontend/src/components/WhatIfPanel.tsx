/**
 * What-If Simulation Panel
 * 
 * Shows simulation controls and impact summary when in What-If mode.
 */

import type { SimulationResult, TaskChangeInput } from '../api/types';
import './WhatIfPanel.css';

interface WhatIfPanelProps {
  isActive: boolean;
  onToggle: () => void;
  simulationResult: SimulationResult | null;
  pendingChanges: TaskChangeInput[];
  onClearChanges: () => void;
}

export function WhatIfPanel({
  isActive,
  onToggle,
  simulationResult,
  pendingChanges,
  onClearChanges,
}: WhatIfPanelProps) {
  if (!isActive) {
    return (
      <button className="whatif-toggle" onClick={onToggle}>
        🔮 What-If Mode
      </button>
    );
  }

  return (
    <div className="whatif-panel">
      <div className="whatif-header">
        <h3>🔮 What-If Mode</h3>
        <button className="btn-secondary btn-sm" onClick={onToggle}>
          Exit
        </button>
      </div>

      <div className="whatif-instructions">
        <p>Edit task dates in the inspector to see the ripple effect.</p>
        <p className="hint">Changes are not saved until you apply them.</p>
      </div>

      {pendingChanges.length > 0 && (
        <div className="whatif-changes">
          <h4>Pending Changes: {pendingChanges.length}</h4>
          <button className="btn-link" onClick={onClearChanges}>
            Clear all
          </button>
        </div>
      )}

      {simulationResult && (
        <div className="whatif-result">
          <div className="impact-summary">
            <div className={`impact-badge ${simulationResult.impact_days > 0 ? 'negative' : simulationResult.impact_days < 0 ? 'positive' : 'neutral'}`}>
              {simulationResult.impact_days > 0 && '+'}
              {simulationResult.impact_days} days
            </div>
            <div className="impact-label">Project Impact</div>
          </div>

          <div className="date-comparison">
            <div className="date-row">
              <span className="label">Original End</span>
              <span className="value">{simulationResult.original_end_date}</span>
            </div>
            <div className="date-row">
              <span className="label">Simulated End</span>
              <span className={`value ${simulationResult.impact_days > 0 ? 'delayed' : ''}`}>
                {simulationResult.simulated_end_date}
              </span>
            </div>
          </div>

          {simulationResult.affected_tasks.length > 0 && (
            <div className="affected-tasks">
              <h4>Affected Tasks ({simulationResult.affected_tasks.length})</h4>
              <ul>
                {simulationResult.affected_tasks.slice(0, 5).map((task) => (
                  <li key={task.task_id}>
                    <span className="task-name">{task.title}</span>
                    <span className={`delta ${task.delta_days > 0 ? 'delayed' : 'earlier'}`}>
                      {task.delta_days > 0 && '+'}
                      {task.delta_days}d
                    </span>
                  </li>
                ))}
                {simulationResult.affected_tasks.length > 5 && (
                  <li className="more">
                    ...and {simulationResult.affected_tasks.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WhatIfPanel;

