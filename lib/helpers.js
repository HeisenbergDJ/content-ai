export const STEPS = [
  {
    key: "topic",
    label: "选题策划",
    desc: "输入品牌信息和目标，AI 将为你生成多个选题方向供选择。",
    placeholder: "描述品牌背景、产品信息、目标受众和推文需求，AI 将生成多个选题方向……",
  },
  {
    key: "copywriting",
    label: "文案撰写",
    desc: "基于选题生成多版本文案，并支持追加要求重写。",
    placeholder: "基于已选选题，补充文案风格、目标字数、参考示例等要求……",
  },
  {
    key: "image_plan",
    label: "切图设计",
    desc: "生成头图、章节配图、尾图方案，并可匹配资料库素材。",
    placeholder: "描述配图风格偏好，或上传参考图片，AI 将为你规划配图方案……",
  },
  {
    key: "layout",
    label: "排版输出",
    desc: "整合文案与配图，输出公众号排版预览与源码。",
    placeholder: "描述排版偏好，如：分段方式、引用样式、首图风格等……",
  },
];

export const NAV_ITEMS = [
  { key: "creator",   label: "AI创作台", badge: "3", group: "核心功能" },
  { key: "dashboard", label: "工作台", group: "核心功能" },
  { key: "library",   label: "资源中心", group: "核心功能" },
  { key: "skills",    label: "Skill中心", badge: "6", group: "核心功能" },
  { key: "admin",     label: "管理后台", adminOnly: true, group: "管理" },
];

export const CREATOR_TABS = [
  { key: "wechat",       label: "公众号图文" },
  { key: "interactive",  label: "交互式图文" },
  { key: "poster",       label: "海报设计",   soon: true },
  { key: "ppt",          label: "PPT设计",    soon: true },
  { key: "video",        label: "短视频设计", soon: true },
];

export const INTERACTIVE_TYPES = [
  { key: "hotspot", label: "热区浮现" },
  { key: "flip",    label: "翻页卡片" },
  { key: "enter",   label: "入场动效" },
  { key: "reveal",  label: "点击翻转" },
];

export const ADMIN_TABS = [
  { key: "credits",    label: "Credits 管理" },
  { key: "employees",  label: "员工管理" },
  { key: "outputs",    label: "产物总览" },
  { key: "review",     label: "上传审核" },
  { key: "perms",      label: "资料库权限" },
  { key: "api-config", label: "模型配置" },
];

export const STATUS_LABEL = {
  draft:          "草稿",
  in_progress:    "进行中",
  pending_review: "待处理",
  completed:      "已完成",
  failed:         "失败",
  archived:       "已归档",
  abandoned:      "已放弃",
};

export function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function initials(name = "") {
  return name.slice(0, 1) || "用";
}

export function statusClass(status) {
  if (status === "completed" || status === "archived") return "tag-done";
  if (status === "pending_review" || status === "failed") return "tag-danger";
  if (status === "in_progress") return "tag-progress";
  return "";
}

export function stepIndex(key) {
  return Math.max(0, STEPS.findIndex((s) => s.key === key));
}

export function projectGradient(index) {
  const gradients = [
    "linear-gradient(135deg,#4F46E5,#7C3AED,#2563EB)",
    "linear-gradient(135deg,#059669,#34D399,#6EE7B7)",
    "linear-gradient(135deg,#D97706,#F59E0B,#FDE68A)",
    "linear-gradient(135deg,#0F766E,#2563EB,#A5B4FC)",
    "linear-gradient(135deg,#DB2777,#F472B6,#FBCFE8)",
  ];
  return gradients[index % gradients.length];
}
