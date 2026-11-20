import type { DonationPoint, DonationStatus, FieldPayload } from '../types';
import { api } from './api';

const SNAPSHOT_PREFIX = 'collecte_field_snapshot_';
const QUEUE_PREFIX = 'collecte_field_queue_';

export interface QueuedStatusMutation {
  pointId: string;
  status: DonationStatus;
  queuedAt: string;
}

export function saveFieldSnapshot(token: string, data: FieldPayload): void {
  try {
    localStorage.setItem(
      `${SNAPSHOT_PREFIX}${token}`,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        data,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadFieldSnapshot(token: string): { savedAt: string; data: FieldPayload } | null {
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}${token}`);
    if (!raw) return null;
    return JSON.parse(raw) as { savedAt: string; data: FieldPayload };
  } catch {
    return null;
  }
}

export function getPendingQueue(token: string): QueuedStatusMutation[] {
  try {
    const raw = localStorage.getItem(`${QUEUE_PREFIX}${token}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedStatusMutation[]) : [];
  } catch {
    return [];
  }
}

function savePendingQueue(token: string, queue: QueuedStatusMutation[]): void {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(`${QUEUE_PREFIX}${token}`);
    } else {
      localStorage.setItem(`${QUEUE_PREFIX}${token}`, JSON.stringify(queue));
    }
  } catch {
    // Ignore storage errors
  }
}

export function enqueueStatusUpdate(
  token: string,
  pointId: string,
  status: DonationStatus
): QueuedStatusMutation[] {
  const existing = getPendingQueue(token).filter((item) => item.pointId !== pointId);
  const next: QueuedStatusMutation[] = [
    ...existing,
    {
      pointId,
      status,
      queuedAt: new Date().toISOString(),
    },
  ];
  savePendingQueue(token, next);
  return next;
}

export function applyPendingQueueToSnapshot(
  data: FieldPayload,
  queue: QueuedStatusMutation[]
): FieldPayload {
  if (queue.length === 0) return data;
  const overrides = new Map(queue.map((q) => [q.pointId, q.status]));
  return {
    ...data,
    points: data.points.map((pt) => {
      const queuedStatus = overrides.get(pt.id);
      return queuedStatus ? { ...pt, status: queuedStatus } : pt;
    }),
  };
}

export async function flushPendingQueue(token: string): Promise<{
  syncedCount: number;
  remainingCount: number;
  updatedPoints: DonationPoint[];
}> {
  const queue = getPendingQueue(token);
  if (queue.length === 0) {
    return { syncedCount: 0, remainingCount: 0, updatedPoints: [] };
  }

  const remaining: QueuedStatusMutation[] = [];
  const updatedPoints: DonationPoint[] = [];
  let syncedCount = 0;

  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    try {
      const res = await api.updateFieldPointStatus(token, item.pointId, item.status);
      updatedPoints.push(res.point);
      syncedCount += 1;
    } catch {
      // Conserve cet élément et les suivants pour la prochaine reconnexion
      remaining.push(...queue.slice(i));
      break;
    }
  }

  savePendingQueue(token, remaining);
  return {
    syncedCount,
    remainingCount: remaining.length,
    updatedPoints,
  };
}
