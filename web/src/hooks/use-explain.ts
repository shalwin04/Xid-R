import { useState, useCallback } from 'react';
import api from '@/lib/api';

export interface ExplainTimelineItem {
  timestamp: string;
  event: string;
  reasoning: string;
  factors: string[];
  source: string;
  llm_powered: boolean;
}

export interface KeyDecision {
  event: string;
  reasoning: string;
  factors: string[];
}

export interface LeaseExplanation {
  lease_id: string;
  current_status: string;
  agent_id: string;
  gpu_type: string;
  timeline: ExplainTimelineItem[];
  key_decisions: KeyDecision[];
  summary: string;
}

export interface ExplainResult {
  lease_id: string;
  lease_status: string;
  explanation: string;
  timeline: Array<{
    timestamp: string;
    event: string;
    details: string;
  }>;
  decision_factors: string[];
}

export function useExplain() {
  const [explanation, setExplanation] = useState<ExplainResult | null>(null);
  const [leaseExplanation, setLeaseExplanation] = useState<LeaseExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the new LLM-powered explain API
  const explain = useCallback(async (leaseId: string, eventType?: string) => {
    setLoading(true);
    setError(null);

    try {
      // Try the new explain API first
      const result = await api.explainLease(leaseId);
      setLeaseExplanation(result);

      // Convert to the old format for backwards compatibility
      setExplanation({
        lease_id: result.lease_id,
        lease_status: result.current_status,
        explanation: result.summary,
        timeline: result.timeline.map((item) => ({
          timestamp: item.timestamp,
          event: item.event,
          details: item.reasoning,
        })),
        decision_factors: result.key_decisions.flatMap((d) => d.factors),
      });
    } catch (err) {
      // Fall back to the old MCP explain tool
      try {
        const result = await api.explain(leaseId, eventType);
        setExplanation(result);
        setLeaseExplanation(null);
      } catch (fallbackErr) {
        setError((fallbackErr as Error).message);
        setExplanation(null);
        setLeaseExplanation(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Ask a natural language question about a lease
  const askAboutLease = useCallback(async (leaseId: string, question: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.askAboutLease(leaseId, question);
      return result;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear the current explanation
  const clearExplanation = useCallback(() => {
    setExplanation(null);
    setLeaseExplanation(null);
    setError(null);
  }, []);

  return {
    explanation,
    leaseExplanation,
    loading,
    error,
    explain,
    askAboutLease,
    clearExplanation,
  };
}
