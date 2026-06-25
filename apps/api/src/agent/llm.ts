import "../utils/env.js";
import { Memory, Tool, ToolCall, FinalAnswer, AgentStep } from "../../types.js";

export const llmClient = {
  async callModel(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined");
    }

    const timeoutMs = process.env.GEMINI_TIMEOUT_MS
      ? parseInt(process.env.GEMINI_TIMEOUT_MS, 10)
      : 30000;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API request failed with status ${response.status}: ${errorText}`);
    }

    const json: any = await response.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Invalid response received from Gemini API");
    }

    return text;
  }
};

export function validateSchema(schema: any, data: any): boolean {
  if (!schema) return true;

  if (schema.type === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return false;
    }

    if (Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (!(req in data)) {
          return false;
        }
      }
    }

    if (schema.properties && typeof schema.properties === "object") {
      for (const key of Object.keys(data)) {
        const propSchema = schema.properties[key];
        if (propSchema) {
          if (!validateSchema(propSchema, data[key])) {
            return false;
          }
        } else if (schema.additionalProperties === false) {
          return false;
        }
      }
    }
    return true;
  }

  if (schema.type === "string") {
    return typeof data === "string";
  }
  if (schema.type === "number") {
    return typeof data === "number" && !Number.isNaN(data);
  }
  if (schema.type === "integer") {
    return typeof data === "number" && Number.isInteger(data);
  }
  if (schema.type === "boolean") {
    return typeof data === "boolean";
  }
  if (schema.type === "array") {
    if (!Array.isArray(data)) return false;
    if (schema.items) {
      for (const item of data) {
        if (!validateSchema(schema.items, item)) {
          return false;
        }
      }
    }
    return true;
  }

  return true;
}

export async function nextStep(memory: Memory, tools: Tool[]): Promise<{ step: AgentStep; tokens: number }> {
  const messagesContext = memory.messages
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n");

  const toolsContext = tools
    .map(t => `- Name: ${t.name}\n  Description: ${t.description}\n  Schema: ${JSON.stringify(t.inputSchema)}`)
    .join("\n\n");

  const prompt = `
You are an agent with access to the following tools:
${toolsContext}

Conversation history:
${messagesContext}

Output your next step as a single JSON object. Do not include any other text, markdown formatting, or code blocks.
If you need to call a tool, output:
{
  "type": "tool_call",
  "tool_name": "name_of_tool",
  "arguments": { ... }
}

If you are done and have a final answer, output:
{
  "type": "final_answer",
  "answer": "your final response"
}
`;

  const rawResponse = await llmClient.callModel(prompt);

  // Estimate token usage (standard 4 characters per token average)
  const tokens = Math.ceil(prompt.length / 4) + Math.ceil(rawResponse.length / 4);

  let parsed: any;
  try {
    parsed = JSON.parse(rawResponse.trim());
  } catch (err) {
    throw new Error("Malformed JSON from LLM response");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid LLM output structure");
  }

  if (parsed.type === "tool_call") {
    const { tool_name, arguments: args } = parsed;
    if (typeof tool_name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) {
      throw new Error("Invalid LLM output structure for tool call");
    }

    const tool = tools.find(t => t.name === tool_name);
    if (!tool) {
      throw new Error(`Unknown tool: ${tool_name}`);
    }

    if (!validateSchema(tool.inputSchema, args)) {
      throw new Error(`Invalid arguments for tool ${tool_name}`);
    }

    return {
      step: {
        type: "tool_call",
        tool_name,
        arguments: args
      },
      tokens
    };
  } else if (parsed.type === "final_answer") {
    const { answer } = parsed;
    if (typeof answer !== "string") {
      throw new Error("Invalid LLM output structure for final answer");
    }

    return {
      step: {
        type: "final_answer",
        answer
      },
      tokens
    };
  } else {
    throw new Error("Invalid LLM output structure: missing or invalid type");
  }
}
