import OpenAI from "openai";

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const completion = await deepseek.chat.completions.create({
  model: "deepseek-v4-pro",
  messages: [
    { role: "system", content: "你是一个严格输出结构化 JSON 的助手。" },
    {
      role: "user",
      content:
        "请生成 3 个内容选题候选，候选的 candidateId 分别为 1、2、3，数组中每项包含 candidateId/title/description。",
    },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "return_topic_candidates",
        description: "按固定 JSON 结构返回内容方向候选",
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
                  candidateId: { type: "string", enum: ["1", "2", "3"] },
                  title: { type: "string" },
                  description: { type: "string" }
                },
                required: ["candidateId", "title", "description"],
                additionalProperties: false
              }
            }
          },
          required: ["candidates"],
          additionalProperties: false
        }
      }
    }
  ]
});

const argsText = completion.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
const contentText = completion.choices[0]?.message?.content;
const selectedText = argsText ?? contentText ?? "{}";
const data = JSON.parse(selectedText);
console.log(JSON.stringify(data, null, 2));