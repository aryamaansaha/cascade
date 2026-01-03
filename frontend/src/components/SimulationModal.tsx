/**
 * What-If Simulation Modal
 * 
 * Allows users to simulate changes to a task and see the ripple effect.
 */

import { useState } from 'react';
import type { Task, SimulationResult } from '../api/types';
import { useSimulation } from '../hooks/useProjectData';
import { notify } from '../utils/notifications';
import './SimulationModal.css';

interface SimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  projectId: string;
}

export function SimulationModal({ isOpen, onClose, task, projectId }: SimulationModalProps) {
  const [startDate, setStartDate] = useState(task.start_date);
  const [duration, setDuration] = useState(task.duration_days);
  const [result, setResult] = useState<SimulationResult | null>(null);
  
  const simulationMutation = useSimulation();
  
  if (!isOpen) return null;
  
  const hasChanges = startDate !== task.start_date || duration !== task.duration_days;
  
  const handleSimulate = async () => {
    const changes = [];
    
    if (startDate !== task.start_date) {
      changes.push({ task_id: task.id, start_date: startDate });
    }
    if (duration !== task.duration_days) {
      changes.push({ task_id: task.id, duration_days: duration });
    }
    
    // If both changed, combine into one change object
    if (startDate !== task.start_date && duration !== task.duration_days) {
      changes.length = 0;
      changes.push({ task_id: task.id, start_date: startDate, duration_days: duration });
    }
    
    if (changes.length === 0) {
      notify.warning('No changes to simulate');
      return;
    }
    
    try {
      const simResult = await simulationMutation.mutateAsync({
        projectId,
        request: { changes },
      });
      setResult(simResult);
    } catch (error) {
      notify.error('Failed to run simulation');
    }
  };
  
  const handleReset = () => {
    setStartDate(task.start_date);
    setDuration(task.duration_days);
    setResult(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal simulation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔮 What-If: {task.title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <p className="modal-description">
            Preview what happens if you change this task. No changes will be saved.
          </p>
          
          <div className="simulation-inputs">
            <div className="form-group">
              <label htmlFor="sim-start">Start Date</label>
              <div className="input-with-compare">
                <input
                  id="sim-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                {startDate !== task.start_date && (
                  <span className="original-value">was: {task.start_date}</span>
                )}
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="sim-duration">Duration (days)</label>
              <div className="input-with-compare">
                <input
                  id="sim-duration"
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                />
                {duration !== task.duration_days && (
                  <span className="original-value">was: {task.duration_days}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="simulation-actions">
            <button 
              className="btn-primary"
              onClick={handleSimulate}
              disabled={!hasChanges || simulationMutation.isPending}
            >
              {simulationMutation.isPending ? 'Simulating...' : 'Run Simulation'}
            </button>
            <button className="btn-secondary" onClick={handleReset}>
              Reset
            </button>
          </div>
          
          {result && (
            <div className="simulation-result">
              <div className={`impact-banner ${result.impact_days > 0 ? 'negative' : result.impact_days < 0 ? 'positive' : 'neutral'}`}>
                <span className="impact-value">
                  {result.impact_days > 0 && '+'}
                  {result.impact_days} days
                </span>
                <span className="impact-label">Project Impact</span>
              </div>
              
              <div className="result-details">
                <div className="detail-row">
                  <span>Original Project End</span>
                  <span className="mono">{result.original_end_date}</span>
                </div>
                <div className="detail-row">
                  <span>Simulated Project End</span>
                  <span className={`mono ${result.impact_days > 0 ? 'text-danger' : ''}`}>
                    {result.simulated_end_date}
                  </span>
                </div>
              </div>
              
              {result.affected_tasks.length > 0 && (
                <div className="affected-list">
                  <h4>Affected Tasks ({result.affected_tasks.length})</h4>
                  <ul>
                    {result.affected_tasks.map((t) => (
                      <li key={t.task_id}>
                        <span className="task-name">{t.title}</span>
                        <span className="task-dates">
                          {t.original_end} → {t.simulated_end}
                        </span>
                        <span className={`delta ${t.delta_days > 0 ? 'delayed' : 'earlier'}`}>
                          {t.delta_days > 0 && '+'}
                          {t.delta_days}d
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {result.affected_tasks.length === 0 && (
                <p className="no-impact">No downstream tasks affected.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SimulationModal;

