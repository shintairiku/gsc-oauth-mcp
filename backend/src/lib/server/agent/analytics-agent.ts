import type { McpTool } from "@/lib/server/mcp/analytics-tools";

type JsonObject = Record<string, unknown>;

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: JsonObject;
};

type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock;

type AnthropicMessageResponse = {
  content?: AnthropicBlock[];
  stop_reason?: string;
};

function toolMap(tools: McpTool[]): Map<string, McpTool> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

export async function runAnalyticsAgent(params: {
  userMessage: string;
  tools: McpTool[];
}): Promise<{ answer: string; toolCalls: Array<{ name: string; input: JsonObject; result: JsonObject }> }> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("Missing required environment variable: ANTHROPIC_API_KEY");
  }

  const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
  const toolByName = toolMap(params.tools);

  const tools = params.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: [{ type: "text", text: params.userMessage }] },
  ];

  const toolCalls: Array<{ name: string; input: JsonObject; result: JsonObject }> = [];

  for (let step = 0; step < 8; step += 1) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 1400,
        system: [
          "あなたはWebアナリストです。",
          "質問内容に応じて必要なツールだけを呼び出してください。",
          "GSCとGA4のどちらを使うかはユーザーの意図とデータ内容から判断してください。",
          "回答は必ず日本語で、実データを根拠に具体的に説明してください。",
        ].join("\n"),
        messages,
        tools,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API failed: ${response.status} ${errorText}`);
    }

    const modelResponse = (await response.json()) as AnthropicMessageResponse;
    const content = modelResponse.content ?? [];

    if (modelResponse.stop_reason !== "tool_use") {
      const answer = content
        .filter((block): block is AnthropicTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!answer) {
        throw new Error("invalid_claude_response");
      }

      return { answer, toolCalls };
    }

    messages.push({ role: "assistant", content });

    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
    }> = [];

    for (const block of content) {
      if (block.type !== "tool_use") {
        continue;
      }

      const tool = toolByName.get(block.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: `unknown_tool:${block.name}` }),
        });
        continue;
      }

      try {
        const result = await tool.execute(block.input ?? {});
        toolCalls.push({ name: block.name, input: block.input ?? {}, result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "tool_execution_error";
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: message }),
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("agent_max_steps_exceeded");
}
