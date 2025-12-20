/**
 * Modal for creating a new task with proper form inputs.
 */

import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import type { TaskCreate } from '../api/types';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskCreate) => Promise<void>;
  projectId: string;
}

export function CreateTaskModal({
  isOpen,
  onClose,
  onSubmit,
  projectId,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setDurationDays(1);
      setStartDate(new Date().toISOString().split('T')[0]); // Today
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        duration_days: durationDays,
        start_date: startDate || undefined,
        project_id: projectId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Task" size="md">
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className={`form-group ${!title.trim() && error ? 'error' : ''}`}>
          <label htmlFor="task-title">Title *</label>
          <input
            id="task-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter task title"
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="task-description">Description</label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional task description"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="task-duration">Duration (days)</label>
            <input
              id="task-duration"
              type="number"
              min={0}
              value={durationDays}
              onChange={(e) => setDurationDays(parseInt(e.target.value) || 0)}
            />
            <span className="form-helper">
              {durationDays === 0 ? 'This will be a milestone' : `${durationDays} calendar day${durationDays !== 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="task-start">Start Date</label>
            <input
              id="task-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !title.trim()}
          >
            {isSubmitting ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CreateTaskModal;

