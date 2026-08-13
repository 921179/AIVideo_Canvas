import { createServer } from "node:http";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 4173);
const root = fileURLToPath(new URL(".", import.meta.url));
const dataRoot = process.env.CANVAS_DATA_DIR ? resolve(process.env.CANVAS_DATA_DIR) : join(root, "data");
const projectsRoot = join(dataRoot, "projects");
const assetsRoot = join(dataRoot, "assets");
const indexFile = join(projectsRoot, "index.json");
const maxJsonBytes = 25 * 1024 * 1024;
const maxAssetBytes = 15 * 1024 * 1024;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif"
};

await Promise.all([mkdir(projectsRoot, { recursive: true }), mkdir(assetsRoot, { recursive: true })]);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    if (url.pathname.startsWith("/assets/")) return await serveAsset(response, url.pathname);
    return await serveStatic(response, url.pathname);
  } catch (error) {
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.message || "服务器错误" });
    else response.end();
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`AI 画布原型已启动：http://127.0.0.1:${port}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/projects") {
    const index = await readProjectIndex();
    return sendJson(response, 200, index);
  }

  if (request.method === "POST" && url.pathname === "/api/projects/import") {
    const payload = await readJsonBody(request, maxJsonBytes);
    const projects = Array.isArray(payload.projects) ? payload.projects : [];
    const requestedCurrentProjectId = payload.currentProjectId;
    if (!projects.length) throw httpError(400, "没有可导入的项目");
    const existing = await readProjectIndex();
    const existingIds = new Set(existing.projects.map(project => project.id));
    let imported = 0;
    for (const project of projects) {
      if (!validProjectId(project?.id) || existingIds.has(project.id) || !project.data) continue;
      await writeJsonAtomic(projectFile(project.id), project.data);
      existing.projects.push({ id: project.id, name: project.data.name || "未命名项目" });
      existingIds.add(project.id);
      imported++;
    }
    if (!imported) throw httpError(409, "项目已经存在或数据无效");
    if (validProjectId(requestedCurrentProjectId) && existing.projects.some(project => project.id === requestedCurrentProjectId)) existing.currentProjectId = requestedCurrentProjectId;
    else if (!existing.currentProjectId) existing.currentProjectId = existing.projects[0]?.id || null;
    await writeProjectIndex(existing);
    return sendJson(response, 201, { imported, ...existing });
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const id = decodeURIComponent(projectMatch[1]);
    assertProjectId(id);
    if (request.method === "GET") {
      try {
        return sendJson(response, 200, JSON.parse(await readFile(projectFile(id), "utf8")));
      } catch (error) {
        if (error.code === "ENOENT") throw httpError(404, "项目不存在");
        throw error;
      }
    }
    if (request.method === "PUT") {
      const data = await readJsonBody(request, maxJsonBytes);
      await writeJsonAtomic(projectFile(id), data);
      const index = await readProjectIndex();
      const entry = index.projects.find(project => project.id === id);
      if (entry) entry.name = data.name || "未命名项目";
      else index.projects.push({ id, name: data.name || "未命名项目" });
      index.currentProjectId = id;
      await writeProjectIndex(index);
      return sendJson(response, 200, { id, name: data.name || "未命名项目" });
    }
    if (request.method === "DELETE") {
      try { await unlink(projectFile(id)); } catch (error) { if (error.code !== "ENOENT") throw error; }
      const index = await readProjectIndex();
      index.projects = index.projects.filter(project => project.id !== id);
      if (index.currentProjectId === id) index.currentProjectId = index.projects[0]?.id || null;
      await writeProjectIndex(index);
      return sendJson(response, 200, index);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/assets") {
    const contentType = request.headers["content-type"] || "";
    if (!contentType.startsWith("image/")) throw httpError(415, "仅支持图片资源");
    const extension = extensionForType(contentType);
    if (!extension) throw httpError(415, "不支持此图片格式");
    const body = await readBody(request, maxAssetBytes);
    const name = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    await writeFile(join(assetsRoot, name), body);
    return sendJson(response, 201, { url: `/assets/${name}` });
  }

  throw httpError(404, "接口不存在");
}

async function serveAsset(response, pathname) {
  const name = basename(decodeURIComponent(pathname));
  if (!name || pathname !== `/assets/${name}`) throw httpError(400, "无效资源地址");
  const file = join(assetsRoot, name);
  const body = await readFile(file);
  response.writeHead(200, { "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" });
  response.end(body);
}

async function serveStatic(response, pathname) {
  const requestPath = decodeURIComponent(pathname);
  if (requestPath !== "/" && requestPath !== "/index.html") throw httpError(404, "文件未找到");
  const relativeName = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const file = safeJoin(root, relativeName);
  const body = await readFile(file);
  response.writeHead(200, { "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream" });
  response.end(body);
}

async function readProjectIndex() {
  try {
    const parsed = JSON.parse(await readFile(indexFile, "utf8"));
    return {
      currentProjectId: validProjectId(parsed.currentProjectId) ? parsed.currentProjectId : null,
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter(project => validProjectId(project?.id)).map(project => ({ id: project.id, name: project.name || "未命名项目" })) : []
    };
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    const files = await readdir(projectsRoot);
    const projects = [];
    for (const file of files.filter(name => name.endsWith(".json") && name !== "index.json")) {
      const id = file.slice(0, -5);
      if (!validProjectId(id)) continue;
      try {
        const data = JSON.parse(await readFile(join(projectsRoot, file), "utf8"));
        projects.push({ id, name: data.name || "未命名项目" });
      } catch {}
    }
    return { currentProjectId: projects[0]?.id || null, projects };
  }
}

async function writeProjectIndex(index) {
  await writeJsonAtomic(indexFile, { currentProjectId: index.currentProjectId || null, projects: index.projects });
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function projectFile(id) {
  assertProjectId(id);
  return join(projectsRoot, `${id}.json`);
}

function validProjectId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id);
}

function assertProjectId(id) {
  if (!validProjectId(id)) throw httpError(400, "无效项目 ID");
}

function safeJoin(base, target) {
  const file = normalize(join(base, target));
  const distance = relative(normalize(base), file);
  if (distance.startsWith("..") || distance.includes(":")) throw httpError(400, "无效路径");
  return file;
}

function extensionForType(type) {
  return ({ "image/webp": ".webp", "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif" })[type.split(";")[0].toLowerCase()];
}

async function readJsonBody(request, limit) {
  const body = await readBody(request, limit);
  try { return JSON.parse(body.toString("utf8")); } catch { throw httpError(400, "JSON 格式无效"); }
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw httpError(413, "请求内容过大");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
