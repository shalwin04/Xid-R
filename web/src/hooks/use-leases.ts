import { useState, useEffect, useCallback } from 'react';
import api, { Lease, LeaseRequest, LeaseResponse, ReleaseResponse, ExplainResponse } from '@/lib/api';

export function useLeases(initialStatus?: string) {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeases = useCallback(async (status?: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getLeases(status);
      setLeases(response.leases);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeases(initialStatus);
  }, [fetchLeases, initialStatus]);

  const refresh = useCallback(() => fetchLeases(initialStatus), [fetchLeases, initialStatus]);

  return { leases, loading, error, refresh, fetchLeases };
}

export function useLease(leaseId: string) {
  const [lease, setLease] = useState<Lease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLease = useCallback(async () => {
    if (!leaseId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.getLease(leaseId);
      setLease(response.lease);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [leaseId]);

  useEffect(() => {
    fetchLease();
  }, [fetchLease]);

  return { lease, loading, error, refresh: fetchLease };
}

export function useRequestGpu() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestGpu = useCallback(async (request: LeaseRequest): Promise<LeaseResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.requestGpu(request);
      return response;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { requestGpu, loading, error };
}

export function useReleaseLease() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const releaseLease = useCallback(async (leaseId: string): Promise<ReleaseResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.releaseLease({ lease_id: leaseId });
      return response;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { releaseLease, loading, error };
}

export function useExplain() {
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = useCallback(async (leaseId: string, eventType?: string): Promise<ExplainResponse | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.explain(leaseId, eventType);
      setExplanation(response);
      return response;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { explanation, explain, loading, error };
}
