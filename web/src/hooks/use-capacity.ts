import { useState, useEffect, useCallback } from 'react';
import api, { CapacityUnit } from '@/lib/api';

export interface CapacitySummary {
  total: number;
  available: number;
  leased: number;
  harvestable: number;
  byGpuType: Record<string, { total: number; available: number }>;
}

export function useCapacity() {
  const [units, setUnits] = useState<CapacityUnit[]>([]);
  const [summary, setSummary] = useState<CapacitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCapacity = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [unitsRes, summaryRes] = await Promise.all([
        api.getCapacityUnits(),
        api.getCapacitySummary(),
      ]);
      setUnits(unitsRes.capacity_units);
      setSummary(summaryRes.summary);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCapacity();
  }, [fetchCapacity]);

  return { units, summary, loading, error, refresh: fetchCapacity };
}

export function useAvailableCapacity(gpuType: string) {
  const [units, setUnits] = useState<CapacityUnit[]>([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailable = useCallback(async () => {
    if (!gpuType) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.getAvailableCapacity(gpuType);
      setUnits(response.units);
      setAvailableCount(response.available_count);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [gpuType]);

  useEffect(() => {
    fetchAvailable();
  }, [fetchAvailable]);

  return { units, availableCount, loading, error, refresh: fetchAvailable };
}
