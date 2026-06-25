import "../utils/env.js";
import { Memory, Tool, ToolCall, FinalAnswer, AgentStep } from "../../types.js";

export const llmClient = {
  async callModel(prompt: string): Promise<string> {
    if (process.env.MOCK_LLM === "true") {
      const lines = prompt.split("\n");
      let lastUserIndex = -1;
      let hasToolAfterUser = false;
      let lastUserLine = "";

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]?.trim() || "";
        if (line.startsWith("USER:")) {
          lastUserIndex = i;
          lastUserLine = line;
          break;
        }
      }

      if (lastUserIndex !== -1) {
        for (let i = lastUserIndex + 1; i < lines.length; i++) {
          const line = lines[i]?.trim() || "";
          if (line.startsWith("TOOL:") || line.startsWith("tool:")) {
            hasToolAfterUser = true;
            break;
          }
        }
      }

      if (lastUserLine.includes("sandbox/test.txt")) {
        if (hasToolAfterUser) {
          return JSON.stringify({
            type: "final_answer",
            answer: "Successfully wrote sandbox/test.txt"
          });
        }
        return JSON.stringify({
          type: "tool_call",
          tool_name: "write_file",
          arguments: {
            path: "sandbox/test.txt",
            content: "Hello GateKeeper"
          }
        });
      }

      if (lastUserLine.includes("sandbox/allowed.txt")) {
        if (hasToolAfterUser) {
          return JSON.stringify({
            type: "final_answer",
            answer: "Successfully wrote sandbox/allowed.txt"
          });
        }
        return JSON.stringify({
          type: "tool_call",
          tool_name: "write_file",
          arguments: {
            path: "sandbox/allowed.txt",
            content: "Auto approved content"
          }
        });
      }

      return JSON.stringify({
        type: "final_answer",
        answer: "Mock response."
      });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const grokKey = process.env.GROK_API_KEY ;

    let timeoutMs = 30000;
    if (process.env.GEMINI_TIMEOUT_MS) {
      const parsed = parseInt(process.env.GEMINI_TIMEOUT_MS, 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 300000) {
        timeoutMs = parsed;
      }
    }

    let geminiError: Error = new Error("Unknown error");

    // 1. Try Gemini first (as first preference)
    if (geminiKey && geminiKey.trim() !== "") {
      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiKey,
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
          throw new Error(`Gemini API returned status ${response.status}: ${errorText}`);
        }

        const json: any = await response.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error("Invalid response received from Gemini API");
        }
        return text;
      } catch (err: any) {
        // If it is a client timeout/abort error, propagate it directly without fallback
        if (err.name === "AbortError" || err.message.includes("aborted")) {
          throw err;
        }
        geminiError = err;
        console.warn("Gemini API call failed, attempting fallback to Grok:", err.message);
      }
    } else {
      geminiError = new Error("GEMINI_API_KEY environment variable is not defined");
    }

    // 2. Fallback to Grok (xAI API) or Groq if Gemini failed
    if (grokKey && grokKey.trim() !== "") {
      const isGroq = grokKey.trim().startsWith("gsk_");
      const endpoint = isGroq
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://api.x.ai/v1/chat/completions";
      
      const defaultModel = isGroq ? "llama-3.3-70b-versatile" : "grok-2";
      const model = process.env.GROK_MODEL || process.env.XAI_MODEL || defaultModel;
      const providerName = isGroq ? "Groq" : "Grok";

      try {
        const response = await fetch(
          endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${grokKey.trim()}`,
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: "user", content: prompt }],
              response_format: { type: "json_object" }
            }),
            signal: AbortSignal.timeout(timeoutMs)
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`${providerName} API returned status ${response.status}: ${errorText}`);
        }

        const json: any = await response.json();
        // Support choices (Grok/Groq) and candidates (for stub testing)
        if (json.choices) {
          const text = json.choices?.[0]?.message?.content;
          if (!text) {
            throw new Error(`Invalid response received from ${providerName} API`);
          }
          return text;
        } else if (json.candidates) {
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            throw new Error("Invalid response received from fallback model");
          }
          return text;
        } else {
          throw new Error(`Unknown response format received from ${providerName} API`);
        }
      } catch (err: any) {
        console.error(`${providerName} fallback API call failed:`, err.message);
        throw new Error(
          `Security Agent Service Error: Both primary (Gemini) and fallback (${providerName}) models failed to respond.\n` +
          `• Gemini Error: ${geminiError.message}\n` +
          `• ${providerName} Error: ${err.message}`
        );
      }
    }

    // 3. Display user-friendly message if both failed or fallback API key is missing
    throw new Error(
      `Security Agent Service Error: Primary model (Gemini) failed to respond, and no fallback model is configured.\n` +
      `• Gemini Error: ${geminiError.message}`
    );
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
If you need to call a single tool, output:
{
  "type": "tool_call",
  "tool_name": "name_of_tool",
  "arguments": { ... }
}

If you need to call multiple independent tools in parallel, output:
{
  "type": "tool_calls",
  "tool_calls": [
    { "tool_name": "name_of_tool_1", "arguments": { ... } },
    { "tool_name": "name_of_tool_2", "arguments": { ... } }
  ]
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
  } else if (parsed.type === "tool_calls") {
    const { tool_calls } = parsed;
    if (!Array.isArray(tool_calls)) {
      throw new Error("Invalid LLM output structure for parallel tool calls");
    }
    if (tool_calls.length === 0) {
      throw new Error("LLM returned an empty tool_calls array; at least one tool is required");
    }

    for (const tc of tool_calls) {
      if (!tc || typeof tc !== "object" || typeof tc.tool_name !== "string" || !tc.arguments || typeof tc.arguments !== "object" || Array.isArray(tc.arguments)) {
        throw new Error("Invalid tool call in parallel list");
      }

      const tool = tools.find(t => t.name === tc.tool_name);
      if (!tool) {
        throw new Error(`Unknown tool: ${tc.tool_name}`);
      }

      if (!validateSchema(tool.inputSchema, tc.arguments)) {
        throw new Error(`Invalid arguments for tool ${tc.tool_name}`);
      }
    }

    return {
      step: {
        type: "tool_calls",
        tool_calls: tool_calls.map(tc => ({
          tool_name: tc.tool_name,
          arguments: tc.arguments
        }))
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
