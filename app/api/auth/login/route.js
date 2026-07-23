import { getDb, normalizeDoc } from "@/lib/mongodb";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();

  if (!email) {
    return Response.json({ ok: false, message: "请输入邮箱" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db.collection("users").findOne({ email });

  if (!user) {
    return Response.json({ ok: false, message: "账号不存在" }, { status: 404 });
  }

  if (user.status !== "active") {
    return Response.json({ ok: false, message: "该员工已停用，无法登录" }, { status: 403 });
  }

  const tenant = await db.collection("tenants").findOne({ _id: user.enterpriseId });
  if (tenant && tenant.status !== "active") {
    return Response.json({ ok: false, message: "企业账号当前不可用" }, { status: 403 });
  }

  return Response.json({
    ok: true,
    user: normalizeDoc(user),
    tenant: normalizeDoc(tenant),
  });
}
