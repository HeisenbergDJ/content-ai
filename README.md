# ContentAI MVP Web (Next.js + MongoDB)

## 启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量（可从 `.env.local.example` 复制）

```bash
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=contentai
```

3. 启动开发服务器

```bash
npm run dev
```

打开：`http://localhost:3000`

## 已实现（对齐原型主结构）

1. 登录页：读取 MongoDB 用户，停用员工不可登录
2. 侧边栏五大模块：工作台、AI创作台、资料库、Skill中心、管理后台
3. 工作台：统计卡、最近创作、团队动态
4. AI创作台：公众号任务卡片、继续创作、4 步流程、AI 模拟生成
5. 资料库：分类卡片、资料列表、权限与审核状态展示
6. Skill中心：Skill卡片展示
7. 管理后台：Credits管理、员工管理、产物总览、上传审核、资料权限

## 演示登录

可使用数据库中的 active 用户登录，例如：

```text
lili@company.com
chenwei@company.com
zhangwei@company.com
```

当前演示环境暂不校验密码。

## API

1. `GET /api/bootstrap`
- 从 MongoDB 读取真实数据（tenants/users/tasks/library/skills/activities 等）

2. `POST /api/ai/generate`
- AI 预留接口（当前返回模拟候选）

3. `PATCH /api/admin/credits/quota`
- 管理员调整员工配额，校验 `quota >= used`

4. `PATCH /api/admin/employees/toggle`
- 员工启停（示例实现）

## 说明

1. 当前 AI 相关为模拟数据占位，后续可在 `/api/ai/generate` 接入真实模型编排。
2. 数据结构按 `scripts/init-contentai-db.mongosh.js` 初始化后的 `contentai` 数据库读取。
