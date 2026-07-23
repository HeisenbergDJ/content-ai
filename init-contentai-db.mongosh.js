// =============================================================
// ContentAI MongoDB 初始化脚本（mongosh 兼容）
// 用法：
//   $env:CONTENTAI_DB_NAME="contentai"; mongosh "mongodb://localhost:27017" .\init-contentai-db.mongosh.js
// 可选：
//   $env:DROP_EXISTING="true"   // 先 drop 数据库
//   $env:SEED_DEMO_DATA="false" // 跳过示例数据
// =============================================================

const CONTENTAI_DB_NAME =
  (typeof process !== "undefined" && process.env && process.env.CONTENTAI_DB_NAME)
    ? process.env.CONTENTAI_DB_NAME
    : ((typeof process !== "undefined" && process.env && process.env.DB_NAME) ? process.env.DB_NAME : "contentai");
const DROP_EXISTING = (typeof process !== "undefined" && process.env && process.env.DROP_EXISTING === "true");
const SEED_DEMO_DATA = !(typeof process !== "undefined" && process.env && process.env.SEED_DEMO_DATA === "false");
const DAY = 24 * 60 * 60;

const target = db.getSiblingDB(CONTENTAI_DB_NAME);

if (DROP_EXISTING) {
  target.dropDatabase();
  print("! dropped existing database");
}

const collections = [
  "tenants",
  "departments",
  "users",
  "creation_tasks",
  "library_items",
  "skills",
  "skill_versions",
  "credit_usage_records",
  "audit_logs",
  "activities",
  "credit_period_history",
];

const validators = {
  tenants: {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "status", "plan", "seats", "credits", "createdAt", "updatedAt"],
      properties: {
        name: { bsonType: "string", minLength: 1 },
        status: { enum: ["active", "suspended", "trial"] },
        plan: {
          bsonType: "object",
          required: ["name", "billingCycle", "startedAt", "expiresAt"],
          properties: {
            name: { bsonType: "string" },
            billingCycle: { enum: ["monthly", "quarterly", "yearly"] },
            startedAt: { bsonType: "date" },
            expiresAt: { bsonType: "date" }
          }
        },
        seats: {
          bsonType: "object",
          required: ["total", "active", "disabled", "available"],
          properties: {
            total: { bsonType: ["int", "long"] },
            active: { bsonType: ["int", "long"] },
            disabled: { bsonType: ["int", "long"] },
            available: { bsonType: ["int", "long"] }
          }
        },
        credits: {
          bsonType: "object",
          required: ["subscription", "topups"],
          properties: {
            subscription: {
              bsonType: "object",
              required: ["quota", "employeeAllocated", "consumed", "remaining", "periodStart", "periodEnd"],
              properties: {
                quota:             { bsonType: ["int", "long"] },
                employeeAllocated: { bsonType: ["int", "long"] },
                consumed:          { bsonType: ["int", "long"] },
                remaining:         { bsonType: ["int", "long"] },
                periodStart:       { bsonType: "string" },
                periodEnd:         { bsonType: "string" }
              }
            },
            topups: { bsonType: "array" }
          }
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  },
  departments: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "name", "groups", "createdAt", "updatedAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        name: { bsonType: "string" },
        groups: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["_id", "name", "memberCount"],
            properties: {
              _id: { bsonType: "objectId" },
              name: { bsonType: "string" },
              memberCount: { bsonType: ["int", "long"] }
            }
          }
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  },
  users: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "name", "email", "role", "status", "credits", "createdAt", "updatedAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        name: { bsonType: "string" },
        email: { bsonType: "string" },
        role: { enum: ["employee", "tenant_admin", "super_admin"] },
        status: { enum: ["active", "disabled", "invited"] },
        credits: {
          bsonType: "object",
          required: ["period", "quota", "used", "remaining"],
          properties: {
            period: { bsonType: "string" },
            quota: { bsonType: ["int", "long"] },
            used: { bsonType: ["int", "long"] },
            remaining: { bsonType: ["int", "long"] }
          }
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  },
  creation_tasks: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "userId", "type", "title", "status", "currentStep", "currentStepIndex", "credits", "steps", "createdAt", "updatedAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        type: { enum: ["wechat", "poster", "ppt", "video"] },
        status: { enum: ["draft", "in_progress", "pending_review", "completed", "failed", "archived", "abandoned"] },
        currentStep: { bsonType: "string" },
        currentStepIndex: { bsonType: ["int", "long"] },
        credits: { bsonType: "object" },
        steps: { bsonType: "object" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  },
  library_items: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "type", "name", "permission", "review", "createdAt", "updatedAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        type: { enum: ["file", "folder"] },
        name: { bsonType: "string" },
        permission: { bsonType: "object" },
        review: { bsonType: "object" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  },
  skills: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "name", "type", "category", "status", "createdAt", "updatedAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        name: { bsonType: "string" },
        type: { enum: ["distilled", "system_preset"] },
        category: { enum: ["topic", "copywriting", "image", "layout", "review", "other"] },
        status: { enum: ["active", "disabled", "distilling"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      }
    }
  },
  skill_versions: {
    $jsonSchema: {
      bsonType: "object",
      required: ["skillId", "enterpriseId", "version", "createdAt", "isCurrent"],
      properties: {
        skillId: { bsonType: "objectId" },
        enterpriseId: { bsonType: "objectId" },
        version: { bsonType: "string" },
        createdAt: { bsonType: "date" },
        isCurrent: { bsonType: "bool" }
      }
    }
  },
  credit_usage_records: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "userId", "period", "type", "amount", "createdAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        period: { bsonType: "string" },
        type: { enum: ["consume", "quota_adjust", "enterprise_topup", "refund"] },
        amount: { bsonType: ["int", "long", "double", "decimal"] },
        createdAt: { bsonType: "date" }
      }
    }
  },
  audit_logs: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "action", "objectType", "createdAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        action: { bsonType: "string" },
        objectType: { bsonType: "string" },
        createdAt: { bsonType: "date" }
      }
    }
  },
  activities: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "actor", "verb", "object", "displayText", "visibility", "createdAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        actor: { bsonType: "object" },
        verb: { bsonType: "string" },
        object: { bsonType: "object" },
        displayText: { bsonType: "string" },
        visibility: { enum: ["tenant", "department", "self"] },
        createdAt: { bsonType: "date" }
      }
    }
  },
  credit_period_history: {
    $jsonSchema: {
      bsonType: "object",
      required: ["enterpriseId", "scope", "period", "snapshot", "archivedAt"],
      properties: {
        enterpriseId: { bsonType: "objectId" },
        scope: { enum: ["user", "tenant"] },
        period: { bsonType: "string" },
        snapshot: { bsonType: "object" },
        archivedAt: { bsonType: "date" }
      }
    }
  }
};

function ensureCollection(name) {
  const exists = target.getCollectionNames().includes(name);
  if (!exists) {
    target.createCollection(name, { validator: validators[name], validationLevel: "moderate" });
    print(`+ created collection: ${name}`);
    return;
  }

  target.runCommand({ collMod: name, validator: validators[name], validationLevel: "moderate" });
  print(`= collection exists (validator synced): ${name}`);
}

function ensureIndex(coll, key, options) {
  const idxName = target[coll].createIndex(key, options || {});
  print(`  [${coll}] ${idxName}`);
}

function seedDemoData() {
  print("\n--- seed demo data ---");

  let tenant = target.tenants.findOne({ name: "TechNova 科技公司" });
  if (!tenant) {
    const r = target.tenants.insertOne({
      name: "TechNova 科技公司",
      logo: null,
      status: "active",
      plan: {
        name: "enterprise",
        billingCycle: "monthly",
        startedAt: ISODate("2026-01-01T00:00:00Z"),
        expiresAt: ISODate("2027-01-01T00:00:00Z"),
      },
      seats: { total: 10, active: 3, disabled: 1, available: 6 },
      credits: {
        period: "2026-05",
        totalQuota: 20000,
        employeeAllocated: 5000,
        consumed: 1200,
        remaining: 18800,
      },
      createdAt: ISODate("2025-12-01T00:00:00Z"),
      updatedAt: new Date(),
    });
    tenant = target.tenants.findOne({ _id: r.insertedId });
    print(`+ tenant: ${tenant.name}`);
  } else {
    print(`= tenant exists: ${tenant.name}`);
  }

  const tid = tenant._id;

  const deptDefs = [
    { name: "品牌部", order: 1, groups: ["策划组", "创意组"] },
    { name: "设计部", order: 2, groups: ["视觉组", "动效组"] },
  ];
  const deptMap = {};
  deptDefs.forEach((d) => {
    let dep = target.departments.findOne({ enterpriseId: tid, name: d.name });
    if (!dep) {
      const groups = d.groups.map((g) => ({ _id: new ObjectId(), name: g, memberCount: 0 }));
      const r = target.departments.insertOne({
        enterpriseId: tid,
        name: d.name,
        order: d.order,
        groups: groups,
        createdAt: ISODate("2026-01-01T00:00:00Z"),
        updatedAt: new Date(),
      });
      dep = target.departments.findOne({ _id: r.insertedId });
      print(`+ department: ${d.name}`);
    }
    const gMap = {};
    dep.groups.forEach((g) => { gMap[g.name] = g._id; });
    deptMap[d.name] = { departmentId: dep._id, groups: gMap };
  });

  const userDefs = [
    { name: "李粒粒", email: "lili@company.com", role: "tenant_admin", status: "active", dept: "品牌部", group: "策划组", quota: 2000, used: 720 },
    { name: "陈伟", email: "chenwei@company.com", role: "employee", status: "active", dept: "品牌部", group: "创意组", quota: 1500, used: 450 },
    { name: "张薇", email: "zhangwei@company.com", role: "employee", status: "active", dept: "设计部", group: "视觉组", quota: 1500, used: 300 },
    { name: "刘芳", email: "liufang@company.com", role: "employee", status: "disabled", dept: "设计部", group: "动效组", quota: 0, used: 0 },
  ];

  const userMap = {};
  userDefs.forEach((u) => {
    const exists = target.users.findOne({ enterpriseId: tid, email: u.email });
    if (exists) {
      userMap[u.name] = exists._id;
      return;
    }
    const depInfo = deptMap[u.dept];
    const r = target.users.insertOne({
      enterpriseId: tid,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      department: {
        departmentId: depInfo.departmentId,
        departmentName: u.dept,
        groupId: depInfo.groups[u.group],
        groupName: u.group,
      },
      credits: {
        period: "2026-05",
        quota: u.quota,
        used: u.used,
        remaining: u.quota - u.used,
      },
      seat: {
        assignedAt: ISODate("2026-01-05T00:00:00Z"),
        lastDisabledAt: u.status === "disabled" ? ISODate("2026-04-01T00:00:00Z") : null,
        lastEnabledAt: u.status === "active" ? ISODate("2026-04-15T00:00:00Z") : null,
      },
      createdAt: ISODate("2026-01-05T00:00:00Z"),
      updatedAt: new Date(),
    });
    userMap[u.name] = r.insertedId;
    print(`+ user: ${u.name}`);
  });

  if (!target.creation_tasks.findOne({ enterpriseId: tid, title: "五月品牌活动推文" })) {
    target.creation_tasks.insertOne({
      enterpriseId: tid,
      userId: userMap["李粒粒"],
      userName: "李粒粒",
      type: "wechat",
      title: "五月品牌活动推文",
      status: "in_progress",
      currentStep: "copywriting",
      currentStepIndex: 2,
      credits: { consumed: 15, estimated: 45 },
      steps: {
        topic: {
          status: "completed",
          messages: [
            { _id: new ObjectId(), round: 1, role: "user", text: "给我 3 个品牌活动选题", createdAt: new Date() },
            { _id: new ObjectId(), round: 1, role: "assistant", text: "已生成 3 个方向", createdAt: new Date() },
          ],
          candidates: [
            { candidateId: "topic_a", round: 1, generatedFromMessageId: null, title: "春日焕新活动", generatedAt: new Date() },
            { candidateId: "topic_b", round: 1, generatedFromMessageId: null, title: "新品发布活动", generatedAt: new Date() },
          ],
          selectedCandidateId: "topic_b",
          selectedRound: 1,
        },
        copywriting: {
          status: "in_progress",
          messages: [
            { _id: new ObjectId(), round: 1, role: "user", text: "语气更专业一些", createdAt: new Date() },
          ],
          candidates: [],
          selectedCandidateId: null,
          selectedRound: null,
        },
      },
      archive: { archived: false, libraryItemId: null, archivedAt: null },
      createdAt: ISODate("2026-05-27T13:50:00Z"),
      updatedAt: new Date(),
      completedAt: null,
    });
    print("+ task: 五月品牌活动推文");
  }

  if (!target.library_items.findOne({ enterpriseId: tid, name: "品牌视觉规范V3.pdf" })) {
    target.library_items.insertOne({
      enterpriseId: tid,
      type: "file",
      name: "品牌视觉规范V3.pdf",
      category: "brand",
      fileType: "pdf",
      parentId: null,
      path: "/品牌资料/",
      storage: {
        provider: "s3",
        bucket: "contentai-demo",
        key: `tenants/${tid}/files/brand-v3.pdf`,
        url: "https://cdn.example.com/brand-v3.pdf",
        size: 2400000,
        mime: "application/pdf",
        checksum: "sha256:demo",
        uploadedAt: new Date(),
      },
      uploader: { userId: userMap["李粒粒"], name: "李粒粒" },
      source: { kind: "user_upload", taskId: null, taskType: null },
      permission: { level: "public", scopeDepartmentIds: [], scopeUserIds: [] },
      review: { status: "approved", submittedAt: new Date(), reviewedAt: new Date(), rejectReason: null },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    print("+ library_item: 品牌视觉规范V3.pdf");
  }

  if (!target.skills.findOne({ enterpriseId: tid, name: "陈伟的文案风格" })) {
    const versionId = new ObjectId();
    const skillInsert = target.skills.insertOne({
      enterpriseId: tid,
      name: "陈伟的文案风格",
      type: "distilled",
      category: "copywriting",
      status: "active",
      source: { employeeId: userMap["陈伟"], employeeName: "陈伟" },
      currentVersionId: versionId,
      currentVersion: "v1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    target.skill_versions.insertOne({
      _id: versionId,
      skillId: skillInsert.insertedId,
      enterpriseId: tid,
      version: "v1",
      promptTemplate: "以专业、可信、可执行的语气输出。",
      styleSamples: [],
      createdAt: new Date(),
      isCurrent: true,
    });
    print("+ skill: 陈伟的文案风格");
  }

  if (target.credit_usage_records.countDocuments({ enterpriseId: tid }) === 0) {
    target.credit_usage_records.insertOne({
      enterpriseId: tid,
      userId: userMap["李粒粒"],
      period: "2026-05",
      type: "consume",
      amount: -10,
      context: { taskId: null, taskType: "wechat", stepName: "copywriting", modelCallId: null },
      snapshot: { userQuota: 2000, userUsedAfter: 720, userRemainingAfter: 1280 },
      operator: null,
      reason: "AI 文案生成（公众号·步骤2）",
      createdAt: new Date(),
    });
    print("+ credit_usage_records: 1");
  }

  if (target.audit_logs.countDocuments({ enterpriseId: tid }) === 0) {
    target.audit_logs.insertOne({
      enterpriseId: tid,
      actor: { userId: userMap["李粒粒"], name: "李粒粒", role: "tenant_admin" },
      action: "credits.adjust_quota",
      objectType: "user",
      objectId: userMap["陈伟"],
      before: { quota: 1200 },
      after: { quota: 1500 },
      reason: "项目阶段提升配额",
      createdAt: new Date(),
    });
    print("+ audit_logs: 1");
  }

  if (target.activities.countDocuments({ enterpriseId: tid }) === 0) {
    target.activities.insertOne({
      enterpriseId: tid,
      actor: { userId: userMap["陈伟"], name: "陈伟", type: "user" },
      verb: "completed",
      object: { type: "task", id: null, name: "五月品牌活动推文" },
      displayText: "完成了一篇品牌活动推文",
      visibility: "tenant",
      createdAt: new Date(),
    });
    print("+ activities: 1");
  }

  if (target.credit_period_history.countDocuments({ enterpriseId: tid }) === 0) {
    target.credit_period_history.insertOne({
      enterpriseId: tid,
      scope: "user",
      userId: userMap["李粒粒"],
      period: "2026-04",
      snapshot: { quota: 2000, used: 1500, remaining: 500 },
      archivedAt: ISODate("2026-05-01T00:00:00Z"),
    });
    print("+ credit_period_history: 1");
  }
}

print(`\n=== init db: ${CONTENTAI_DB_NAME} ===`);
print("\n--- collections ---");
collections.forEach(ensureCollection);

print("\n--- indexes ---");
ensureIndex("tenants", { name: 1 });
ensureIndex("tenants", { status: 1, "plan.expiresAt": 1 });

ensureIndex("departments", { enterpriseId: 1, name: 1 }, { unique: true });
ensureIndex("departments", { enterpriseId: 1, "groups._id": 1 });

ensureIndex("users", { enterpriseId: 1, email: 1 }, { unique: true });
ensureIndex("users", { enterpriseId: 1, status: 1 });
ensureIndex("users", { enterpriseId: 1, "department.departmentId": 1 });
ensureIndex("users", { enterpriseId: 1, role: 1 });

ensureIndex("creation_tasks", { enterpriseId: 1, userId: 1, status: 1, updatedAt: -1 });
ensureIndex("creation_tasks", { enterpriseId: 1, status: 1, updatedAt: -1 });
ensureIndex("creation_tasks", { enterpriseId: 1, type: 1, updatedAt: -1 });
ensureIndex("creation_tasks", { enterpriseId: 1, "archive.libraryItemId": 1 }, { sparse: true });

ensureIndex("library_items", { enterpriseId: 1, parentId: 1, name: 1 });
ensureIndex("library_items", { enterpriseId: 1, category: 1, "review.status": 1, updatedAt: -1 });
ensureIndex("library_items", { enterpriseId: 1, "review.status": 1 });
ensureIndex("library_items", { enterpriseId: 1, "uploader.userId": 1 });
ensureIndex("library_items", { enterpriseId: 1, "source.taskId": 1 }, { sparse: true });
ensureIndex("library_items", { name: "text", description: "text", tags: "text" }, { name: "library_items_fulltext" });

ensureIndex("skills", { enterpriseId: 1, status: 1, category: 1 });
ensureIndex("skills", { enterpriseId: 1, "source.employeeId": 1 }, { sparse: true });

ensureIndex("skill_versions", { skillId: 1, version: 1 }, { unique: true });
ensureIndex("skill_versions", { skillId: 1, isCurrent: 1 });

ensureIndex("credit_usage_records", { enterpriseId: 1, userId: 1, createdAt: -1 });
ensureIndex("credit_usage_records", { enterpriseId: 1, period: 1, type: 1 });
ensureIndex("credit_usage_records", { "context.taskId": 1, createdAt: -1 }, { sparse: true });
ensureIndex("credit_usage_records", { createdAt: 1 }, { name: "credit_usage_ttl", expireAfterSeconds: 730 * DAY });

ensureIndex("audit_logs", { enterpriseId: 1, createdAt: -1 });
ensureIndex("audit_logs", { enterpriseId: 1, action: 1, createdAt: -1 });
ensureIndex("audit_logs", { "actor.userId": 1, createdAt: -1 });

ensureIndex("activities", { enterpriseId: 1, visibility: 1, createdAt: -1 });
ensureIndex("activities", { createdAt: 1 }, { name: "activities_ttl", expireAfterSeconds: 90 * DAY });

ensureIndex("credit_period_history", { enterpriseId: 1, period: 1, scope: 1, userId: 1 }, { sparse: true });

if (SEED_DEMO_DATA) {
  seedDemoData();
} else {
  print("\n--- seed skipped (SEED_DEMO_DATA=false) ---");
}

print("\n--- stats ---");
collections.forEach((c) => {
  print(`${c}: ${target[c].countDocuments()}`);
});

print("\nDone.\n");
