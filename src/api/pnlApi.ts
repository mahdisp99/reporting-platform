import type { PnLConfig, PnLReport } from '../types/pnl';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

const buildUrl = (path: string): string => `${API_BASE_URL}${path}`;

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json();
    if (payload?.detail) return String(payload.detail);
    return JSON.stringify(payload);
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

export const fetchFilterOptions = async (): Promise<Record<string, Array<string | number>>> => {
  const response = await fetch(buildUrl('/api/pnl/filter-options'));
  if (!response.ok) {
    throw new Error(`Failed to load filter options: ${await readErrorMessage(response)}`);
  }
  const payload = await response.json();
  return payload?.options || {};
};

export const fetchPnLReport = async (config: PnLConfig): Promise<PnLReport> => {
  const response = await fetch(buildUrl('/api/pnl/report'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`Failed to load report: ${await readErrorMessage(response)}`);
  }

  return response.json();
};
