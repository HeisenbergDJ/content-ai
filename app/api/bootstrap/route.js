import { getDb, normalizeDoc } from "@/lib/mongodb";

function pickTenantId(tenant) {
  return tenant?._id || null;
}

export async function GET() {
  const db = await getDb();

  const tenant = await db.collection("tenants").findOne({}, { sort: { updatedAt: -1 } });
  const tenantId = pickTenantId(tenant);

  if (!tenantId) {
    return Response.json({
      ok: true,
      empty: true,
      message: "No tenant data found. Please run seed script first.",
    });
  }

  const [
    users,
    tasks,
    activities,
    library,
    skills,
    usage,
  ] = await Promise.all([
    db.collection("users").find({ enterpriseId: tenantId }).sort({ updatedAt: -1 }).toArray(),
    db.collection("creation_tasks").find({ enterpriseId: tenantId }).sort({ updatedAt: -1 }).limit(50).toArray(),
    db.collection("activities").find({ enterpriseId: tenantId }).sort({ createdAt: -1 }).limit(20).toArray(),
    db.collection("library_items").find({ enterpriseId: tenantId, deletedAt: null }).sort({ updatedAt: -1 }).limit(100).toArray(),
    db.collection("skills").find({ enterpriseId: tenantId }).sort({ updatedAt: -1 }).toArray(),
    db.collection("credit_usage_records").find({ enterpriseId: tenantId }).sort({ createdAt: -1 }).limit(100).toArray(),
  ]);

  const stats = {
    activeUsers: users.filter((u) => u.status === "active").length,
    disabledUsers: users.filter((u) => u.status === "disabled").length,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((t) => t.status === "completed").length,
    inProgressTaskCount: tasks.filter((t) => t.status === "in_progress").length,
    totalCreditsUsed: users.reduce((sum, u) => sum + (u.credits?.used || 0), 0),
    libraryCount: library.length,
    skillCount: skills.length,
  };

  return Response.json({
    ok: true,
    tenant: normalizeDoc(tenant),
    users: normalizeDoc(users),
    tasks: normalizeDoc(tasks),
    activities: normalizeDoc(activities),
    library: normalizeDoc(library),
    skills: normalizeDoc(skills),
    usage: normalizeDoc(usage),
    stats,
  });
}


