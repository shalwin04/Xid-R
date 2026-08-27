/**
 * Gemini Client for LLM-powered agents
 *
 * Provides the foundation for agentic reasoning using Google's Gemini models.
 */

import { GoogleGenerativeAI, GenerativeModel, Content, Part, FunctionDeclaration, Tool } from "@google/generative-ai";
import { getConfig } from "../../config.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger({ module: "gemini-client" });

export interface GeminiConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface AgentResponse {
  text?: string;
  functionCalls?: FunctionCall[];
  reasoning?: string;
}

/**
 * Wrapper around Google Generative AI for agentic use cases.
 */
export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private conversationHistory: Content[] = [];

  private modelName: string;

  constructor(config: GeminiConfig = {}) {
    const appConfig = getConfig();
    const apiKey = process.env.GOOGLE_API_KEY || appConfig.gemini?.apiKey;

    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY environment variable is required for Gemini");
    }

    // Use config model, env var, or default to gemini-3.6-flash
    this.modelName = config.model || process.env.GEMINI_MODEL || "gemini-3.6-flash";

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        maxOutputTokens: config.maxTokens ?? 2048,
      },
    });

    log.info("Gemini client initialized", { model: this.modelName });
  }

  /**
   * Generate a response with optional function calling.
   */
  async generate(
    prompt: string,
    systemInstruction?: string,
    tools?: Tool[]
  ): Promise<AgentResponse> {
    try {
      const model = systemInstruction
        ? this.genAI.getGenerativeModel({
            model: this.modelName,
            systemInstruction,
          })
        : this.model;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools,
      });

      const response = result.response;
      const candidate = response.candidates?.[0];

      if (!candidate) {
        return { text: "No response generated" };
      }

      const content = candidate.content;
      const textParts: string[] = [];
      const functionCalls: FunctionCall[] = [];

      for (const part of content.parts) {
        if ("text" in part && part.text) {
          textParts.push(part.text);
        }
        if ("functionCall" in part && part.functionCall) {
          functionCalls.push({
            name: part.functionCall.name,
            args: part.functionCall.args as Record<string, unknown>,
          });
        }
      }

      return {
        text: textParts.join("\n"),
        functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
        reasoning: textParts.join("\n"),
      };
    } catch (error) {
      log.error("Gemini generation failed", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Chat with memory (for multi-turn conversations).
   */
  async chat(
    message: string,
    systemInstruction?: string,
    tools?: Tool[]
  ): Promise<AgentResponse> {
    this.conversationHistory.push({
      role: "user",
      parts: [{ text: message }],
    });

    const model = systemInstruction
      ? this.genAI.getGenerativeModel({
          model: this.modelName,
          systemInstruction,
        })
      : this.model;

    const chat = model.startChat({
      history: this.conversationHistory.slice(0, -1),
      tools,
    });

    const result = await chat.sendMessage(message);
    const response = result.response;
    const candidate = response.candidates?.[0];

    if (!candidate) {
      return { text: "No response generated" };
    }

    const content = candidate.content;
    this.conversationHistory.push(content);

    const textParts: string[] = [];
    const functionCalls: FunctionCall[] = [];

    for (const part of content.parts) {
      if ("text" in part && part.text) {
        textParts.push(part.text);
      }
      if ("functionCall" in part && part.functionCall) {
        functionCalls.push({
          name: part.functionCall.name,
          args: part.functionCall.args as Record<string, unknown>,
        });
      }
    }

    return {
      text: textParts.join("\n"),
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      reasoning: textParts.join("\n"),
    };
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Create function declarations for Gemini function calling.
   */
  static createFunctionDeclaration(
    name: string,
    description: string,
    parameters: Record<string, unknown>
  ): FunctionDeclaration {
    return {
      name,
      description,
      parameters: parameters as unknown as FunctionDeclaration["parameters"],
    };
  }
}

// Singleton instance
let client: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
  if (!client) {
    client = new GeminiClient();
  }
  return client;
}
