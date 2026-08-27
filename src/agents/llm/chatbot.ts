/**
 * Chatbot Agent - LLM-Powered System Interface
 *
 * Provides a natural language interface to interact with the Xid-R system.
 * Users can ask questions about the system, check status, and get explanations.
 */

import { Tool, SchemaType } from "@google/generative-ai";

import { GeminiClient, FunctionCall } from "./gemini-client.js";
import { createLogger } from "../../utils/logger.js";
import { getLease, getPendingLeases, getLeasesByStatus, getLeaseStats } from "../../db/leases.js";
import { getCapacitySummary, getAvailableCapacity, getAllCapacityUnits } from "../../db/capacity.js";
import { getRecentAuditEvents, getAuditEventsForLease } from "../../db/audit.js";
import { LeaseStatus } from "../../models/lease.js";

const log = createLogger({ module: "chatbot" });

const CHATBOT_SYSTEM_PROMPT = `You are the Xid-R Assistant, an AI-powered helper for the GPU compute broker system.

Xid-R is an intelligent GPU capacity broker that:
- Harvests idle GPU capacity from GKE clusters, Spot VMs, and Cloud Run
- Matches GPU requests from AI agents to available capacity
- Uses A2A (Agent-to-Agent) negotiation for graceful capacity reclaim
- Supports checkpointing so agents can save/restore state during preemption

You can help users:
- Understand how Xid-R works
- Check system status and capacity
- Look up specific lease details
- Explain why certain decisions were made
- Provide guidance on integrating agents with Xid-R

You have access to functions to query the system state.
Always be helpful, accurate, and explain things clearly.

When explaining decisions (using explain_lease_decision), provide clear reasoning
about why the system made certain choices. This is a KEY DIFFERENTIATOR for the demo.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  text: string;
  functionResults?: Array<{ name: string; result: unknown }>;
}

export class ChatbotAgent {
  private gemini: GeminiClient;
  private conversationHistory: ChatMessage[] = [];
  private tools: Tool[];

  constructor(apiKey?: string) {
    this.gemini = new GeminiClient();
    this.tools = this.createTools();
  }

  private createTools(): Tool[] {
    return [
      {
        functionDeclarations: [
          {
            name: "get_system_status",
            description: "Get overall system status including capacity and active leases",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {},
            },
          },
          {
            name: "get_lease_details",
            description: "Get detailed information about a specific lease",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The lease ID to look up",
                },
              },
              required: ["lease_id"],
            },
          },
          {
            name: "list_recent_leases",
            description: "List recent leases with optional status filter",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                status: {
                  type: SchemaType.STRING,
                  description: "Filter by status (pending, active, completed, lost)",
                },
                limit: {
                  type: SchemaType.NUMBER,
                  description: "Maximum number of leases to return (default 10)",
                },
              },
            },
          },
          {
            name: "get_capacity_info",
            description: "Get detailed capacity information by GPU type",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                gpu_type: {
                  type: SchemaType.STRING,
                  description: "Filter by GPU type (optional)",
                },
              },
            },
          },
          {
            name: "explain_lease_decision",
            description: "Explain why certain decisions were made for a lease (grants, denials, evictions)",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                lease_id: {
                  type: SchemaType.STRING,
                  description: "The lease ID to explain",
                },
              },
              required: ["lease_id"],
            },
          },
          {
            name: "get_recent_events",
            description: "Get recent audit events showing system activity",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                limit: {
                  type: SchemaType.NUMBER,
                  description: "Number of events to return (default 20)",
                },
              },
            },
          },
        ],
      },
    ];
  }

  private async executeFunction(call: FunctionCall): Promise<unknown> {
    log.debug("Chatbot executing function", { name: call.name });

    switch (call.name) {
      case "get_system_status":
        return await this.handleGetSystemStatus();

      case "get_lease_details":
        return await this.handleGetLeaseDetails(call.args.lease_id as string);

      case "list_recent_leases":
        return await this.handleListRecentLeases(
          call.args.status as string | undefined,
          call.args.limit as number | undefined
        );

      case "get_capacity_info":
        return await this.handleGetCapacityInfo(call.args.gpu_type as string | undefined);

      case "explain_lease_decision":
        return await this.handleExplainLeaseDecision(call.args.lease_id as string);

      case "get_recent_events":
        return await this.handleGetRecentEvents(call.args.limit as number | undefined);

      default:
        return { error: `Unknown function: ${call.name}` };
    }
  }

  private async handleGetSystemStatus(): Promise<unknown> {
    const [capacitySummary, leaseStats] = await Promise.all([
      getCapacitySummary(),
      getLeaseStats(),
    ]);

    return {
      capacity: capacitySummary,
      leases: {
        pending: leaseStats.pending,
        active: leaseStats.active,
        completed: leaseStats.completed,
        total: leaseStats.pending + leaseStats.active + leaseStats.completed + leaseStats.lost,
      },
      system: {
        status: "operational",
        agents: {
          scheduler: "active (Gemini-powered)",
          negotiator: "active (Gemini-powered)",
        },
      },
    };
  }

  private async handleGetLeaseDetails(leaseId: string): Promise<unknown> {
    const lease = await getLease(leaseId);
    if (!lease) {
      return { error: "Lease not found", lease_id: leaseId };
    }

    return {
      id: lease.id,
      status: lease.status,
      agent_id: lease.tenantAgentId,
      gpu_type: lease.gpuType,
      priority: lease.priority,
      checkpointable: lease.checkpointable,
      capacity_unit_id: lease.capacityUnitId,
      capacity_lane: lease.capacityLane,
      granted_at: lease.grantedAt?.toISOString(),
      released_at: lease.releasedAt?.toISOString(),
      release_reason: lease.releaseReason,
      billable_seconds: lease.billableSeconds,
      savings_usd: lease.savingsUsd,
      checkpoint_uri: lease.checkpointUri,
      checkpoint_size_bytes: lease.checkpointSizeBytes,
    };
  }

  private async handleListRecentLeases(
    status?: string,
    limit?: number
  ): Promise<unknown> {
    // If status is provided, get leases for that status
    // Otherwise, get a mix of active and pending
    const targetLimit = limit || 10;

    if (status) {
      const statusEnum = status as LeaseStatus;
      const leases = await getLeasesByStatus(statusEnum);
      return {
        count: Math.min(leases.length, targetLimit),
        leases: leases.slice(0, targetLimit).map((l) => ({
          id: l.id,
          status: l.status,
          agent_id: l.tenantAgentId,
          gpu_type: l.gpuType,
          created_at: l.createdAt.toISOString(),
        })),
      };
    }

    // Get a mix of active and pending leases
    const [activeLeases, pendingLeases] = await Promise.all([
      getLeasesByStatus(LeaseStatus.ACTIVE),
      getPendingLeases(),
    ]);

    const combined = [...activeLeases, ...pendingLeases].slice(0, targetLimit);

    return {
      count: combined.length,
      leases: combined.map((l) => ({
        id: l.id,
        status: l.status,
        agent_id: l.tenantAgentId,
        gpu_type: l.gpuType,
        created_at: l.createdAt.toISOString(),
      })),
    };
  }

  private async handleGetCapacityInfo(gpuType?: string): Promise<unknown> {
    const [summary, units] = await Promise.all([
      getCapacitySummary(),
      gpuType ? getAvailableCapacity(gpuType) : getAllCapacityUnits(),
    ]);

    return {
      summary,
      units: units.slice(0, 20).map((u) => ({
        id: u.id,
        gpu_type: u.gpuType,
        status: u.status,
        utilization_percent: u.utilizationPercent,
        isolation_mode: u.isolationMode,
        zone: u.zone,
      })),
    };
  }

  private async handleExplainLeaseDecision(leaseId: string): Promise<unknown> {
    const [lease, events] = await Promise.all([
      getLease(leaseId),
      getAuditEventsForLease(leaseId),
    ]);

    if (!lease) {
      return { error: "Lease not found", lease_id: leaseId };
    }

    // Build a timeline of events
    const timeline = events.map((e) => ({
      timestamp: e.timestamp.toISOString(),
      event_type: e.eventType,
      reasoning: e.reasoning,
      decision_factors: e.decisionFactors,
    }));

    return {
      lease_id: leaseId,
      current_status: lease.status,
      timeline,
      key_decisions: events
        .filter((e) => e.reasoning)
        .map((e) => ({
          event: e.eventType,
          reasoning: e.reasoning,
          factors: e.decisionFactors,
        })),
    };
  }

  private async handleGetRecentEvents(limit?: number): Promise<unknown> {
    const events = await getRecentAuditEvents(limit || 20);

    return {
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        type: e.eventType,
        source: e.source,
        lease_id: e.leaseId,
        reasoning: e.reasoning,
      })),
    };
  }

  /**
   * Chat with the assistant.
   */
  async chat(message: string): Promise<ChatResponse> {
    log.info("Chat message received", { message: message.substring(0, 100) });

    // Add to conversation history
    this.conversationHistory.push({ role: "user", content: message });

    const functionResults: Array<{ name: string; result: unknown }> = [];

    // Generate response with function calling
    let response = await this.gemini.chat(message, CHATBOT_SYSTEM_PROMPT, this.tools);
    let iterations = 0;
    const maxIterations = 5;

    // Process function calls
    while (response.functionCalls && iterations < maxIterations) {
      iterations++;

      for (const call of response.functionCalls) {
        const result = await this.executeFunction(call);
        functionResults.push({ name: call.name, result });

        // Continue conversation with function result
        const functionResultMessage = `Function ${call.name} returned:\n${JSON.stringify(result, null, 2)}\n\nPlease provide a helpful response to the user based on this information.`;
        response = await this.gemini.chat(functionResultMessage, CHATBOT_SYSTEM_PROMPT, this.tools);
      }
    }

    const assistantMessage = response.text || "I apologize, but I couldn't generate a response.";

    // Add to history
    this.conversationHistory.push({ role: "assistant", content: assistantMessage });

    return {
      text: assistantMessage,
      functionResults: functionResults.length > 0 ? functionResults : undefined,
    };
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.gemini.clearHistory();
  }

  /**
   * Get conversation history.
   */
  getHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }
}

// Singleton
let chatbot: ChatbotAgent | null = null;

export function getChatbot(): ChatbotAgent {
  if (!chatbot) {
    chatbot = new ChatbotAgent();
  }
  return chatbot;
}
