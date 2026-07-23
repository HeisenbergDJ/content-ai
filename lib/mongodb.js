import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "contentai";

let globalWithMongo = global;
if (!globalWithMongo._mongoClientPromise) {
  const client = new MongoClient(uri);
  globalWithMongo._mongoClientPromise = client.connect();
}

export async function getDb() {
  const client = await globalWithMongo._mongoClientPromise;
  return client.db(dbName);
}

export function toId(value) {
  return value?.toString?.() ?? value;
}

export function normalizeDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  if (Array.isArray(doc)) return doc.map(normalizeDoc);

  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === "_id") {
      out.id = toId(v);
      continue;
    }
    if (v instanceof Date) {
      out[k] = v.toISOString();
      continue;
    }
    if (v && typeof v === "object" && v._bsontype === "ObjectId") {
      out[k] = toId(v);
      continue;
    }
    out[k] = normalizeDoc(v);
  }
  return out;
}
