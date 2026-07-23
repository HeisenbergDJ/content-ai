import { ObjectId } from "mongodb";
import { getDb }         from "@/lib/mongodb";
import { getModelConfig } from "@/lib/aiClient";
import { calcCredits, deductCredits } from "@/lib/credits";

// 各步骤所需的模型能力类型（对应 model_configs 集合中的 type 字段）
// 换模型时只需在管理后台调整 model_configs.enabled，无需改代码
const MODEL_TYPE = {
  topic:       "text-reasoning",  // 选题需要创意推理
  copywriting: "text-reasoning",  // 文案需要创意推理
  image_plan:  "text-chat",       // 切图方案只需结构化输出
  layout:      "text-chat",       // 排版只需结构化输出
  interactive: "vision-chat",     // 交互式图文需要视觉理解
};


// 从字符串中提取第一个完整的 {...} 块（括号深度计数，处理嵌套和字符串内的括号）
function extractFirstJson(text) {
  const start = text.indexOf("{");
  if (start === -1) throw new SyntaxError("AI 返回内容中未找到 JSON 对象");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped)               { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true;  continue; }
    if (ch === '"')            { inString = !inString; continue; }
    if (inString)              { continue; }
    if (ch === "{")            { depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new SyntaxError("AI 返回的 JSON 括号不匹配");
}

async function chatJson(client, modelId, systemPrompt, userPrompt) {
  const completion = await client.chat.completions.create({
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  return { result: extractFirstJson(raw), usage: completion.usage };
}

// ─── image_plan 固定模板（footer 始终为上传区）─────────────────────────────
const IMAGE_SECTIONS_TEMPLATE = [
  { sectionId: "hero",   label: "头图", dimensions: "900×383", candidates: [] },
  { sectionId: "footer", label: "尾图", dimensions: "900×200", sectionType: "upload", candidates: [] },
];

// ─── 主处理函数 ──────────────────────────────────────────────────────────────
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const {
    step = "topic", round = 1, prompt = "", accumulatedContext = {},
    taskId, userId, enterpriseId,
    interactionType = "hotspot", imageUrls = [],
  } = body;
  const now = new Date().toISOString();

  // 校验身份字段
  if (!userId || !enterpriseId) {
    return Response.json({ ok: false, message: "缺少 userId 或 enterpriseId" }, { status: 400 });
  }

  // 按步骤对应的 type 从数据库读取当前启用的模型配置
  const modelType = MODEL_TYPE[step];
  if (!modelType) {
    return Response.json({ ok: false, message: `未知步骤: ${step}` }, { status: 400 });
  }
  let client, modelId, pricing;
  try {
    ({ client, modelId, pricing } = await getModelConfig(modelType));
  } catch (err) {
    console.error(`[ai/generate] 模型配置加载失败 [type=${modelType}]:`, err.message);
    return Response.json({ ok: false, message: err.message }, { status: 500 });
  }

  // 读取 credits 换算系数
  const db = await getDb();
  const platformCfg  = await db.collection("platform_config").findOne({ _id: "credits_config" });
  const creditsPerRmb = platformCfg?.creditsPerRmb ?? 100;

  // 检查员工余额
  const userDoc = await db.collection("users").findOne(
    { _id: new ObjectId(userId) },
    { projection: { "credits.remaining": 1 } }
  );
  if (!userDoc || (userDoc.credits?.remaining ?? 0) <= 0) {
    return Response.json({ ok: false, message: "credits 余额不足，请联系管理员充值" }, { status: 402 });
  }

  try {
    // ── 步骤一：选题策划 ────────────────────────────────────────────────────
    if (step === "topic") {
      const { result, usage } = await chatJson(
        client, modelId,
        `你是一个专业的公众号内容策划师。根据用户提供的品牌信息和需求，生成 3 个有差异化的选题方向。

只输出如下 JSON，不要有任何其他文字：
{
  "candidates": [
    { "candidateId": "topic_a", "title": "方向A：xxx", "description": "核心定位与适用场景" },
    { "candidateId": "topic_b", "title": "方向B：xxx", "description": "核心定位与适用场景" },
    { "candidateId": "topic_c", "title": "方向C：xxx", "description": "核心定位与适用场景" }
  ]
}`,
        prompt || "请生成 3 个公众号选题方向"
      );

      const { credits, costRmb } = calcCredits(modelType, pricing, usage, creditsPerRmb);
      await deductCredits(db, { userId, enterpriseId, taskId, step, modelId, type: modelType, credits, costRmb, usage });

      const candidates = (result.candidates || []).map((c) => ({
        ...c,
        round,
        generatedFromPrompt: prompt,
        generatedAt: now,
      }));
      return Response.json({ ok: true, step, round, model: modelId, credits, candidates });
    }

    // ── 步骤二：文案撰写 ────────────────────────────────────────────────────
    if (step === "copywriting") {
      const topicCtx = accumulatedContext.topic
        ? `已选选题：${accumulatedContext.topic.title}\n选题说明：${accumulatedContext.topic.description}`
        : "";

      const { result, usage } = await chatJson(
        client, modelId,
        `你是一个专业的公众号文案撰写师。根据选题方向和用户补充要求，生成 3 个不同风格的完整文案版本（专业版、亲和版、故事版）。

只输出如下 JSON，不要有任何其他文字：
{
  "candidates": [
    {
      "candidateId": "copy_a",
      "title": "版本A：xxx",
      "summary": "该版本风格定位说明",
      "sections": [
        { "heading": "段落标题", "content": "段落正文内容" }
      ]
    },
    { "candidateId": "copy_b", "title": "版本B：xxx", "summary": "...", "sections": [...] },
    { "candidateId": "copy_c", "title": "版本C：xxx", "summary": "...", "sections": [...] }
  ]
}`,
        [topicCtx, prompt].filter(Boolean).join("\n\n") || "请生成 3 个文案版本"
      );

      const { credits, costRmb } = calcCredits(modelType, pricing, usage, creditsPerRmb);
      await deductCredits(db, { userId, enterpriseId, taskId, step, modelId, type: modelType, credits, costRmb, usage });

      const candidates = (result.candidates || []).map((c) => ({
        ...c,
        round,
        generatedFromPrompt: prompt,
        generatedAt: now,
      }));
      return Response.json({ ok: true, step, round, model: modelId, credits, candidates });
    }

    // ── 步骤三：切图设计 ────────────────────────────────────────────────────
    if (step === "image_plan") {
      const topicCtx = accumulatedContext.topic?.title || "";
      const copyCtx  = accumulatedContext.copywriting?.title || "";
      const ctxHint  = [topicCtx, copyCtx].filter(Boolean).join("，");

      const { result, usage } = await chatJson(
        client, modelId,
        `你是一个专业的公众号视觉设计顾问。根据文案内容为头图（900×383px）生成 2 个不同风格的设计方案，描述视觉构图、色彩基调和排版思路。

只输出如下 JSON，不要有任何其他文字：
{
  "candidates": [
    {
      "candidateId": "hero_a",
      "title": "方案A：xxx风格",
      "description": "视觉方案描述：构图、色调、排版思路",
      "previewLines": ["要点一", "要点二"]
    },
    {
      "candidateId": "hero_b",
      "title": "方案B：xxx风格",
      "description": "视觉方案描述：构图、色调、排版思路",
      "previewLines": ["要点一", "要点二"]
    }
  ]
}`,
        [ctxHint ? `文章背景：${ctxHint}` : "", prompt].filter(Boolean).join("\n") || "请生成头图设计方案"
      );

      const { credits, costRmb } = calcCredits(modelType, pricing, usage, creditsPerRmb);
      await deductCredits(db, { userId, enterpriseId, taskId, step, modelId, type: modelType, credits, costRmb, usage });

      const heroCandidates = (result.candidates || []).map((c) => ({
        ...c,
        round,
        generatedFromPrompt: prompt,
        generatedAt: now,
      }));

      const imageSections = [
        { ...IMAGE_SECTIONS_TEMPLATE[0], selectedId: heroCandidates[0]?.candidateId ?? null, candidates: heroCandidates },
        { ...IMAGE_SECTIONS_TEMPLATE[1], selectedId: null, candidates: [] },
      ];

      return Response.json({ ok: true, step, round, model: modelId, credits, imageSections });
    }

    // ── 步骤四：排版输出（普通 chat，分隔符格式，避免超长 HTML 的 JSON 转义问题）──
    if (step === "layout") {
      const topicCtx     = accumulatedContext.topic?.title || "";
      const copyTitle    = accumulatedContext.copywriting?.title || "";
      const copySections = accumulatedContext.copywriting?.sections || [];
      const copyBody     = copySections.map((s) => `【${s.heading}】\n${s.content}`).join("\n\n");

      const imagePlanData = accumulatedContext.image_plan;
      const heroSection   = imagePlanData?.imageSections?.find((s) => s.sectionId === "hero");
      const footerSection = imagePlanData?.imageSections?.find((s) => s.sectionId === "footer");
      const heroSelected  = heroSection?.candidates?.find((c) => c.candidateId === heroSection?.selectedId)
        ?? heroSection?.candidates?.[0];
      const logoUrl = footerSection?.logoFileItem?.fileUrl || "";
      const qrUrl   = footerSection?.qrFileItem?.fileUrl   || "";

      const heroCtx = heroSelected
        ? `头图方案：${heroSelected.title}\n${heroSelected.description || ""}`
        : "";

      // 服务端直接拼好尾部 HTML，告知 AI 原封不动放到每个排版末尾
      const footerHtml = (() => {
        if (!logoUrl && !qrUrl) return "";
        const logoImg = logoUrl
          ? `<img src="${logoUrl}" alt="品牌Logo" style="height:48px;object-fit:contain;" />`
          : "";
        const qrImg = qrUrl
          ? `<img src="${qrUrl}" alt="二维码" style="width:80px;height:80px;object-fit:contain;" />`
          : "";
        return `<section style="padding:24px 20px;text-align:center;background:#f9fafb;display:flex;flex-direction:column;align-items:center;gap:12px;">
  ${logoImg}
  ${qrImg}
  <p style="font-size:12px;color:#9ca3af;margin:0;">扫码关注，获取更多内容</p>
</section>`;
      })();

      const contextBlock = [
        topicCtx    ? `选题：${topicCtx}`         : "",
        copyTitle   ? `文案版本：${copyTitle}`     : "",
        copyBody    ? `文案内容：\n${copyBody}`    : "",
        heroCtx     ? `配图方案：\n${heroCtx}`    : "",
        prompt      ? `排版要求：${prompt}`        : "",
      ].filter(Boolean).join("\n\n");

      const footerInstruction = footerHtml
        ? `\n\n尾部固定区域（每个排版末尾必须原封不动地插入以下 HTML，不得修改）：\n${footerHtml}`
        : "";

      const systemPrompt = `你是一个专业的微信公众号排版设计师。根据提供的文案内容，生成 2 个不同排版风格的公众号文章排版。

输出格式要求（严格遵守，不得有任何额外说明文字）：

###LAYOUT_A###
TITLE: 排版A的方案名称
SUMMARY: 该排版风格的一句话说明
###SECTION###
<section style="...">
  <!-- 排版A的完整内容，仅 section 标签，不含 html/head/body -->
</section>
###END###

###LAYOUT_B###
TITLE: 排版B的方案名称
SUMMARY: 该排版风格的一句话说明
###SECTION###
<section style="...">
  <!-- 排版B的完整内容，仅 section 标签，不含 html/head/body -->
</section>
###END###

排版要求：
- 仅输出 <section> 标签内容，不要输出 <!DOCTYPE>、<html>、<head>、<body> 等标签
- 使用内联样式，不依赖外部 CSS
- 字体使用 'PingFang SC','Microsoft YaHei',Helvetica,sans-serif
- 整体背景白色，正文色 #333，移动端适配，宽度 100%
- 两个排版风格差异明显（如：正式专业 vs 现代简约）${footerInstruction}`;

      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: contextBlock || "请生成公众号排版" },
        ],
      });

      const content = completion.choices[0]?.message?.content || "";
      const candidates = [];
      const pattern = /###LAYOUT_([AB])###\s*\nTITLE:\s*(.+?)\s*\nSUMMARY:\s*(.+?)\s*\n###SECTION###\s*\n([\s\S]+?)\n###END###/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        candidates.push({
          candidateId: `layout_${match[1].toLowerCase()}`,
          title:       match[2].trim(),
          summary:     match[3].trim(),
          section:     match[4].trim(),
          round,
          generatedFromPrompt: prompt,
          generatedAt: now,
        });
      }

      if (candidates.length === 0) {
        console.error("[ai/generate] layout 解析失败，原始输出：", content.slice(0, 500));
        return Response.json({ ok: false, message: "排版内容解析失败，请重试" }, { status: 500 });
      }

      const { credits, costRmb } = calcCredits(modelType, pricing, completion.usage, creditsPerRmb);
      await deductCredits(db, { userId, enterpriseId, taskId, step, modelId, type: modelType, credits, costRmb, usage: completion.usage });

      return Response.json({ ok: true, step, round, model: modelId, credits, candidates });
    }

    // ── 交互式图文（SVG SMIL 动画） ────────────────────────────────────────────
    if (step === "interactive") {
      const INTERACTION_LABELS = {
        hotspot: "热区浮现（点击热区弹出详情层，再次点击收起）",
        flip:    "翻页卡片（触碰翻页，展现下一张内容）",
        enter:   "入场动效（元素从画面外飞入，带缓动效果）",
        reveal:  "点击翻转（卡片翻转揭示背面内容）",
      };
      const interactionDesc = INTERACTION_LABELS[interactionType] || interactionType;

      const systemPrompt = `你是微信公众号交互式图文开发专家。微信公众号文章不是普通网页，在微信内置的受限 WebView 沙箱中渲染，与标准浏览器有本质差异，必须严格遵守以下约束。

## 微信 WebView 渲染环境（核心约束）

**1. JavaScript 完全禁用**
微信安全沙箱会剥离所有脚本，以下内容绝对不得出现，否则交互完全失效：
- <script> 标签
- 内联事件属性：onclick、ontouchstart、onload、onerror 等
- JS API：addEventListener、setTimeout、document、window 等

**2. SVG 内 CSS 动画不可靠**
微信 WebView 对 SVG 元素内的 CSS animation / @keyframes / transition 支持不一致，不同版本和机型行为不同，不可依赖。

**3. SVG SMIL 是唯一可靠的交互手段**
<animateTransform>、<animate>、<set> 在微信 WebView 中被一致支持，所有交互效果必须且只能用 SMIL 实现。

**4. 触摸事件的独特行为**
在微信 WebView 中，一次手指点击会依次触发两个独立事件：
- touchstart：手指按下时立即触发（约 0ms）
- click：手指抬起后约 300ms 才触发
两者完全独立，可分别绑定两个方向相反的 SMIL 动画，实现"按下显示、抬起收起"效果。

**5. 图片嵌入方式**
SVG <image> 标签在微信 WebView 中加载不稳定，必须用 CSS background-image:url(...) 写在 SVG 元素的 style 属性上。标准结构：<foreignObject> 包裹 <svg style="background-image:url(...)">。

**6. display:none 不可动画化**
SMIL 无法对 display 属性做过渡，隐藏元素必须改用空间位移（translate 推出 viewBox 之外）或 opacity:0。

## 专家技巧

**隐藏与显示**
- translate(4000, 0)：把元素推到屏幕右侧 4000px 外（热区弹窗首选）
- translate(-N, 0) 配合 foreignObject 负偏移：内容藏在 viewBox 左侧（抽拉面板）
- opacity:0 + pointer-events:visiblePainted：透明但可点击的不可见热区
- <set attributeName="visibility" to="hidden" fill="remove">：瞬间隐藏，fill="remove" 使动画结束后自动恢复可见（可重复触发的关键）

**状态锁定（防止 click 打断 touchstart）**
touchstart 触发后 300ms click 会到来，需用以下方式锁住状态：
calcMode="discrete" + dur="800s" + keyTimes="0;.0001;1"
动画一触发即锁定 800 秒，click 到来时动画仍在持续中，无法重置；click 触发另一组独立动画实现反向还原。

**动画终态保持**：fill="freeze" 使动画结束后停留在最终帧，不回弹。

**触发次数控制**：restart="never" 只触发一次（单次展开/切换）；restart="always" 每次都可重新触发（可反复的抽拉动效）。

**热区偏移补偿**：热区透明矩形若在有偏移的父元素内（如父级有 translate(4000,0)），热区自身需加反向 transform="translate(-4000,0)" 抵消，确保视觉坐标正确。

**自动轮播**：多图层用 begin="0s"、begin="3s"、begin="6s" 时间错位 + repeatCount="indefinite"，无需任何 JS 实现无缝循环。

**缓动选择**：calcMode="spline" + keySplines="0.24 0 0.24 1" 实现贝塞尔缓动（滑动感）；默认 linear 适合循环轮播；calcMode="discrete" 适合状态跳变和锁定。

## SVG 参考结构（热区浮现模板）

\`\`\`xml
<section style="overflow:hidden;margin-top:-1px">
<svg style="background-image:url('主图URL');background-size:cover;background-repeat:no-repeat;display:block;line-height:0"
     viewBox="0 0 750 1060">
  <g>
    <animateTransform attributeName="transform" type="translate"
      values="-4000 0;0 0;0 0" begin="touchstart"
      keyTimes="0;.0001;1" dur="800s" calcMode="discrete"/>
    <animateTransform attributeName="transform" type="translate"
      values="0 0;-4000 0;-4000 0" begin="click"
      keyTimes="0;.0001;1" dur="800s" calcMode="discrete"/>
    <g transform="translate(4000 0)">
      <g id="移动-1">
        <animateTransform attributeName="transform" type="translate"
          values="2000 0" begin="click" dur="0.01s" fill="freeze"/>
        <animate attributeName="opacity" values="0;1" begin="click" dur="0.5s" fill="freeze"/>
        <animateTransform attributeName="transform" type="translate"
          values="0 0;2000 0" keyTimes="0;1" begin="touchstart" dur="9000s"/>
        <g style="pointer-events:none" transform="translate(-2000 0)">
          <foreignObject x="0" y="0" width="100%" height="100%">
            <svg xmlns="http://www.w3.org/2000/svg"
              style="overflow:hidden;background-size:100%;background-repeat:no-repeat;background-image:url('弹出图URL');pointer-events:none"
              viewBox="0 0 750 1060"/>
          </foreignObject>
          <rect x="200" y="900" width="350" height="140"
            style="pointer-events:visiblePainted;opacity:0">
            <animate attributeName="x" begin="touchstart" dur="0.8s" values="100000"/>
            <set attributeName="visibility" from="visible" to="hidden" dur="0.01s" fill="remove" begin="touchstart"/>
          </rect>
        </g>
        <rect x="143" y="199" width="303" height="236"
          style="pointer-events:visiblePainted;opacity:0"
          transform="translate(-4000 0)"/>
      </g>
    </g>
  </g>
</svg>
</section>
\`\`\`

## 各交互类型实现要点

- 热区浮现：上述模板，可复制多个 <g id="移动-N"> 实现多热区
- 翻页卡片：多个 SVG 层叠，通过 translate 横向依次推入，begin="prev.click" 串联触发
- 入场动效：begin="0s" 页面加载后自动从屏幕外飞入，无需交互触发
- 点击翻转：两个图层叠加，click 时用 opacity 0→1 / 1→0 模拟翻转切换

## 输出格式（严格遵守，不得有任何额外文字）

###LAYOUT_A###
TITLE: 方案A名称
SUMMARY: 该方案的一句话说明
###SECTION###
<section style="overflow:hidden;margin-top:-1px">
<svg ...完整SVG SMIL代码，绝对不含任何script或JS...>
</svg>
</section>
###END###

###LAYOUT_B###
TITLE: 方案B名称
SUMMARY: 该方案的一句话说明
###SECTION###
<section style="overflow:hidden;margin-top:-1px">
<svg ...完整SVG SMIL代码，绝对不含任何script或JS...>
</svg>
</section>
###END###

## 生成规则
- 第一张图片 URL 用作主背景（background-image），后续图片用作弹出层内容
- viewBox 使用 "0 0 750 1060"（公众号推文标准比例）
- 所有 id 必须唯一（用"移动-1"/"移动-2"/"弹窗-1"等命名）
- 两个方案要有明显差异（热区位置不同 / 弹出层数量不同 / 动效节奏不同）
- 图片 URL 使用用户提供的真实 URL，禁止替换为任何占位符`;

      // 构建用户消息（纯文本，把图片 URL 作为 background-image 嵌入 SVG）
      const imageLines = imageUrls.map((url, i) =>
        i === 0
          ? `- 主背景图（第1张）: ${url}`
          : `- 弹出层图${i}（第${i + 1}张）: ${url}`
      );

      const userContent = [
        `交互类型：${interactionDesc}`,
        prompt ? `用户意图：${prompt}` : "",
        imageUrls.length > 0
          ? `图片资源（请在 SVG 的 background-image 中直接使用以下 URL，不要替换为占位符）：\n${imageLines.join("\n")}`
          : "（未上传图片，请用示例渐变色或纯色作为背景演示效果）",
        "请生成两个风格差异明显的 SVG SMIL 交互式方案。",
      ].filter(Boolean).join("\n\n");

      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userContent },
        ],
        max_tokens: 6000,
      });

      const content = completion.choices[0]?.message?.content || "";
      const candidates = [];
      const pattern = /###LAYOUT_([AB])###\s*\nTITLE:\s*(.+?)\s*\nSUMMARY:\s*(.+?)\s*\n###SECTION###\s*\n([\s\S]+?)\n###END###/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        candidates.push({
          candidateId: `interactive_${match[1].toLowerCase()}`,
          title:       match[2].trim(),
          summary:     match[3].trim(),
          section:     match[4].trim(),
          round,
          generatedAt: now,
        });
      }

      if (candidates.length === 0) {
        console.error("[ai/generate] interactive 解析失败，原始输出：", content.slice(0, 500));
        return Response.json({ ok: false, message: "SVG 内容解析失败，请重试" }, { status: 500 });
      }

      const { credits, costRmb } = calcCredits(modelType, pricing, completion.usage, creditsPerRmb);
      await deductCredits(db, { userId, enterpriseId, taskId, step, modelId, type: modelType, credits, costRmb, usage: completion.usage });

      return Response.json({ ok: true, step, round, model: modelId, credits, candidates });
    }

    return Response.json({ ok: true, step, round, model: modelId, candidates: [] });
  } catch (err) {
    console.error(`[ai/generate] 模型 [${modelId}] 调用失败:`, err);
    return Response.json(
      { ok: false, message: err.message || "AI 接口调用失败，请稍后重试" },
      { status: 500 }
    );
  }
}
