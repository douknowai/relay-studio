export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type TaskType = 'text_to_image' | 'image_to_image' | 'text_to_video' | 'image_to_video' | 'first_last_frame';

/** Check if a task type is a video task. */
export function isVideoTaskType(type: string): boolean {
  return type === 'text_to_video' || type === 'image_to_video' || type === 'first_last_frame';
}

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: ['queued'],
  cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function validateTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task state transition: ${from} -> ${to}`);
  }
}

export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

export function isActiveStatus(status: TaskStatus): boolean {
  return status === 'queued' || status === 'running';
}
