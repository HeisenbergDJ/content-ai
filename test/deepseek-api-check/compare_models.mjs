/**
 * 对比 deepseek-v4-pro 与 deepseek-chat 的 tool calling 返回结构
 * 运行：node --env-file=../web/.env.local test/compare_models.mjs
 * 或：  DEEPSEEK_API_KEY=xxx node test/compare_models.mjs
 */

import OpenAI from "openai";

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const MODELS = ["deepseek-v4-pro", "deepseek-chat"];

const MESSAGES = [
  { role: "system", content: "你是一个严格输出结构化 JSON 的助手。" },
  {
    role: "user",
    content: "请生成 3 个内容选题候选，candidateId 分别为 topic_a、topic_b、topic_c，每项包含 candidateId/title/description。",
  },
];

const TOOL = {
  type: "function",
  function: {
    name: "return_topic_candidates",
    description: "按固定 JSON 结构返回选题候选",
    parameters: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              candidateId: { type: "string", enum: ["topic_a", "topic_b", "topic_c"] },
              title:       { type: "string" },
              description: { type: "string" },
            },
            required: ["candidateId", "title", "description"],
            additionalProperties: false,
          },
        },
      },
      required: ["candidates"],
      additionalProperties: false,
    },
  },
};

async function testModel(model) {
  console.log("\n" + "=".repeat(60));
  console.log(`模型：${model}`);
  console.log("=".repeat(60));

  let completion;
  try {
    completion = await deepseek.chat.completions.create({
      model,
      messages: MESSAGES,
      tools: [TOOL],
      // 不传 tool_choice，与 route.js 保持一致
    });
  } catch (e) {
    console.log(`[请求失败] ${e.message}`);
    return;
  }

  const msg = completion.choices[0]?.message;

  console.log("\n── finish_reason:", completion.choices[0]?.finish_reason);

  // tool_calls
  if (msg?.tool_calls?.length) {
    console.log("\n── tool_calls 数量:", msg.tool_calls.length);
    const args = msg.tool_calls[0].function.arguments;
    console.log("── tool_calls[0].function.name:", msg.tool_calls[0].function.name);
    console.log("── arguments 长度:", args.length);
    console.log("── arguments 前200字符:\n", args.slice(0, 200));
    console.log("── arguments 后100字符:\n", args.slice(-100));
    try {
      const parsed = JSON.parse(args);
      console.log("── JSON.parse 成功，candidates 数量:", parsed.candidates?.length);
    } catch (e) {
      console.log("── JSON.parse 失败:", e.message);
    }
  } else {
    console.log("\n── tool_calls: 无");
  }

  // content
  if (msg?.content) {
    console.log("\n── content 长度:", msg.content.length);
    console.log("── content 前200字符:\n", msg.content.slice(0, 200));
    console.log("── content 后100字符:\n", msg.content.slice(-100));
    try {
      const parsed = JSON.parse(msg.content);
      console.log("── content JSON.parse 成功");
    } catch (e) {
      console.log("── content JSON.parse 失败:", e.message);
    }
  } else {
    console.log("\n── content: 无");
  }

  // reasoning_content（thinking 模型专有）
  if (msg?.reasoning_content) {
    console.log("\n── reasoning_content 长度:", msg.reasoning_content.length);
    console.log("── reasoning_content 前100字符:\n", msg.reasoning_content.slice(0, 100));
  } else {
    console.log("\n── reasoning_content: 无");
  }

  // 完整 message keys
  console.log("\n── message 所有字段:", Object.keys(msg || {}));
}

for (const model of MODELS) {
  await testModel(model);
}

console.log("\n" + "=".repeat(60));
console.log("对比完成");
