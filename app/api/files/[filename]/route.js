import { readFile } from "fs/promises";
import { join, extname } from "path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm":  "text/html; charset=utf-8",
  ".pdf":  "application/pdf",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".webp": "image/webp",
  ".doc":  "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt":  "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls":  "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt":  "text/plain; charset=utf-8",
};

function getUploadDir() {
  return process.env.UPLOAD_DIR || join(process.cwd(), "public", "uploads");
}

export async function GET(req, { params }) {
  const { filename } = params;

  // 防路径穿越：不允许 / \ 或 ..
  if (!filename || /[/\\]/.test(filename) || filename.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const filePath = join(getUploadDir(), filename);
    const buffer   = await readFile(filePath);
    const ext      = extname(filename).toLowerCase();
    const mime     = MIME[ext] || "application/octet-stream";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":  mime,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
