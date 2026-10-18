import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import serve from "koa-static";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const DATA_FILE = path.join(__dirname, "data.json");
const DATA_TMP_FILE = path.join(__dirname, ".data.json.tmp");
const UPLOAD_DIR = path.join(__dirname, "uploads");

const PORT = Number(process.env.PORT || 5500);
const HOST = process.env.HOST || "127.0.0.1";
const PASSCODE = String(process.env.LOVE_PASSCODE || "").trim();

if (!PASSCODE) {
  console.error(
    "[startup] LOVE_PASSCODE 未设置。请在 .env 或系统环境变量中设置一个只有你们知道的暗号。",
  );
  process.exit(1);
}
const SESSION_TTL = 1000 * 60 * 60 * 12;
const MAX_TODO_LENGTH = 300;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 50000;
const MAX_PLACE_LENGTH = 120;
const MAX_PLAN_NOTE_LENGTH = 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES_PER_NOTE = 12;
const MAX_MEMORIES = 120;
const IMAGE_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i;
const IMAGE_URL_RE =
  /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i;

const SECTION_IDS = ["meeting", "travel", "wish"];
const sections = new Set(SECTION_IDS);
const sessions = new Map();

const createEmptyPlan = () => ({
  date: "",
  time: "",
  place: "",
  note: "",
  updatedAt: null,
});

const createEmptyBoard = () => ({
  meeting: { plan: createEmptyPlan(), todos: [], notes: [] },
  travel: { todos: [], notes: [] },
  wish: { todos: [], notes: [] },
  memories: [],
});

function normalizePlan(raw) {
  return {
    date: typeof raw?.date === "string" ? raw.date.slice(0, 10) : "",
    time: typeof raw?.time === "string" ? raw.time.slice(0, 5) : "",
    place: typeof raw?.place === "string" ? raw.place.slice(0, MAX_PLACE_LENGTH) : "",
    note: typeof raw?.note === "string" ? raw.note.slice(0, MAX_PLAN_NOTE_LENGTH) : "",
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : null,
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeMemory(raw) {
  const image = sanitizeImageList([raw?.image])[0];
  if (!image) return null;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : randomUUID(),
    image,
    x: clampNumber(raw.x, 0, 1, 0.45),
    y: clampNumber(raw.y, 0, 1, 0.4),
    rotation: clampNumber(raw.rotation, -180, 180, 0),
    z: Math.round(clampNumber(raw.z, 0, 1_000_000, 0)),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function sanitizeImageList(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, MAX_IMAGES_PER_NOTE)
    .filter((image) => image && typeof image.url === "string" && IMAGE_URL_RE.test(image.url))
    .map((image) => ({
      url: image.url,
      name: cleanString(image.name, 120) || "照片",
      createdAt:
        typeof image.createdAt === "string" ? image.createdAt : new Date().toISOString(),
    }));
}

function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mime: "image/png", extension: "png" };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }

  const gifHeader = buffer.toString("ascii", 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return { mime: "image/gif", extension: "gif" };
  }

  return null;
}

async function readBodyWithLimit(stream, limit) {
  const chunks = [];
  let total = 0;

  for await (const chunk of stream) {
    total += chunk.length;

    if (total > limit) {
      const error = new Error("这张图片太大了，请换一张小于 10MB 的图片。");
      error.status = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function removeImageFiles(images) {
  if (!Array.isArray(images)) return;

  for (const image of images) {
    const filename = path.basename(image?.url || "");

    if (!IMAGE_FILE_RE.test(filename)) continue;

    try {
      await fs.unlink(path.join(UPLOAD_DIR, filename));
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn("[upload] 无法删除图片：", error.message);
      }
    }
  }
}

function getSessionToken(ctx) {
  const authorization = ctx.get("authorization");
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return bearerToken || ctx.cookies.get("love_session", { signed: false }) || "";
}

function setSessionCookie(ctx, token) {
  ctx.cookies.set("love_session", token, {
    maxAge: SESSION_TTL,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    signed: false,
    overwrite: true,
  });
}

let board = createEmptyBoard();
let writeQueue = Promise.resolve();

async function persistBoard() {
  const payload = JSON.stringify(board, null, 2);

  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(DATA_TMP_FILE, payload, "utf8");
    await fs.rename(DATA_TMP_FILE, DATA_FILE);
  });

  return writeQueue;
}

async function loadBoard() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const next = createEmptyBoard();

    for (const id of SECTION_IDS) {
      next[id].todos = Array.isArray(parsed?.[id]?.todos) ? parsed[id].todos : [];
      next[id].notes = Array.isArray(parsed?.[id]?.notes)
        ? parsed[id].notes.map((note) => ({
            ...note,
            images: sanitizeImageList(note.images),
          }))
        : [];
    }

    next.meeting.plan = normalizePlan(parsed?.meeting?.plan);
    next.memories = Array.isArray(parsed?.memories)
      ? parsed.memories
          .map(normalizeMemory)
          .filter(Boolean)
          .slice(0, MAX_MEMORIES)
      : [];
    board = next;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[data] 无法读取数据文件，已使用空白数据：", error.message);
    }
    board = createEmptyBoard();
    await persistBoard();
  }
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getSection(ctx) {
  const id = ctx.params.section;
  if (!sections.has(id)) ctx.throw(404, "找不到这个板块");
  return board[id];
}

function getTodo(ctx) {
  const section = getSection(ctx);
  const todo = section.todos.find((item) => item.id === ctx.params.id);
  if (!todo) ctx.throw(404, "这条待办已经不存在了");
  return { section, todo };
}

function getNote(ctx) {
  const section = getSection(ctx);
  const note = section.notes.find((item) => item.id === ctx.params.id);
  if (!note) ctx.throw(404, "这一页笔记已经不存在了");
  return { section, note };
}

function getMemory(ctx) {
  const memory = board.memories.find((item) => item.id === ctx.params.id);
  if (!memory) ctx.throw(404, "这张照片已经不在纪念墙上了");
  return memory;
}

function nextMemoryZ() {
  return Math.max(0, ...board.memories.map((item) => Number(item.z) || 0)) + 1;
}

function requireAuth(ctx, next) {
  const token = getSessionToken(ctx);
  const expiresAt = sessions.get(token);

  if (!token || !expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    ctx.status = 401;
    ctx.body = { message: "登录状态已失效，请重新开门。" };
    return;
  }

  sessions.set(token, Date.now() + SESSION_TTL);
  return next();
}

const app = new Koa();
const router = new Router();

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    const status = error.status && error.status >= 400 ? error.status : 500;
    ctx.status = status;
    ctx.body = {
      message: status === 500 ? "服务器刚刚走神了，请再试一次。" : error.message,
    };

    if (status === 500) {
      console.error("[server]", error);
    }
  }
});

app.use(bodyParser({ jsonLimit: "1mb" }));

router.get("/api/health", (ctx) => {
  ctx.body = { ok: true };
});

router.post("/api/login", async (ctx) => {
  const passcode = typeof ctx.request.body?.passcode === "string"
    ? ctx.request.body.passcode.trim()
    : "";

  if (passcode !== PASSCODE) {
    ctx.status = 401;
    ctx.body = { message: "暗号好像不对，再想想那个特别的日子。" };
    return;
  }

  const token = randomUUID();
  sessions.set(token, Date.now() + SESSION_TTL);
  setSessionCookie(ctx, token);
  ctx.body = { token, expiresIn: SESSION_TTL };
});

router.post("/api/logout", async (ctx) => {
  const token = getSessionToken(ctx);

  if (token) sessions.delete(token);

  ctx.cookies.set("love_session", "", {
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    signed: false,
    overwrite: true,
  });
  ctx.body = { ok: true };
});

router.get("/api/board", requireAuth, (ctx) => {
  ctx.body = { board };
});

router.get("/api/memories", requireAuth, (ctx) => {
  ctx.body = { memories: board.memories };
});

router.post("/api/memories", requireAuth, async (ctx) => {
  const body = ctx.request.body || {};
  const image = sanitizeImageList([body.image])[0];

  if (!image) {
    ctx.throw(400, "先上传一张照片吧");
  }

  if (board.memories.length >= MAX_MEMORIES) {
    ctx.throw(400, `纪念墙最多放 ${MAX_MEMORIES} 张照片`);
  }

  const memory = {
    id: randomUUID(),
    image,
    x: clampNumber(body.x, 0, 1, 0.45),
    y: clampNumber(body.y, 0, 1, 0.4),
    rotation: clampNumber(body.rotation, -180, 180, 0),
    z: nextMemoryZ(),
    createdAt: new Date().toISOString(),
  };

  board.memories.push(memory);
  await persistBoard();
  ctx.status = 201;
  ctx.body = { memory };
});

router.patch("/api/memories/:id", requireAuth, async (ctx) => {
  const memory = getMemory(ctx);
  const body = ctx.request.body || {};

  if (body.x !== undefined) memory.x = clampNumber(body.x, 0, 1, memory.x);
  if (body.y !== undefined) memory.y = clampNumber(body.y, 0, 1, memory.y);
  if (body.rotation !== undefined) {
    memory.rotation = clampNumber(body.rotation, -180, 180, memory.rotation);
  }
  if (body.z !== undefined) {
    memory.z = Math.round(clampNumber(body.z, 0, 1_000_000, memory.z));
  }

  await persistBoard();
  ctx.body = { memory };
});

router.delete("/api/memories/:id", requireAuth, async (ctx) => {
  const memory = getMemory(ctx);
  const image = memory.image;

  board.memories = board.memories.filter((item) => item.id !== memory.id);
  await persistBoard();
  await removeImageFiles([image]);
  ctx.body = { ok: true };
});

router.get("/uploads/:file", requireAuth, async (ctx) => {
  const filename = ctx.params.file;

  if (!IMAGE_FILE_RE.test(filename)) {
    ctx.throw(404, "图片不存在");
  }

  const filePath = path.join(UPLOAD_DIR, filename);

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) ctx.throw(404, "图片不存在");
  } catch (error) {
    if (error.status === 404) throw error;
    ctx.throw(404, "图片不存在");
  }

  ctx.set("Cache-Control", "no-store");
  ctx.set("X-Content-Type-Options", "nosniff");
  ctx.type = path.extname(filename);
  ctx.body = createReadStream(filePath);
});

router.post("/api/uploads", requireAuth, async (ctx) => {
  const contentType = (ctx.get("content-type") || "").split(";")[0].trim().toLowerCase();

  if (!contentType.startsWith("image/")) {
    ctx.throw(415, "只能上传图片");
  }

  const contentLength = Number(ctx.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    ctx.throw(413, "这张图片太大了，请换一张小于 10MB 的图片。");
  }

  const buffer = await readBodyWithLimit(ctx.req, MAX_IMAGE_BYTES);
  const format = detectImageFormat(buffer);

  if (!format) {
    ctx.throw(415, "暂时只支持 JPG、PNG、WEBP 或 GIF 图片。");
  }

  let originalName = "";

  try {
    originalName = decodeURIComponent(ctx.get("x-file-name") || "");
  } catch {
    originalName = "";
  }

  const safeName = cleanString(originalName.replace(/[\\/:*?"<>|\r\n]/g, " "), 120);
  const filename = `${randomUUID()}.${format.extension}`;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer, { flag: "wx" });

  ctx.status = 201;
  ctx.body = {
    image: {
      url: `/uploads/${filename}`,
      name: safeName || `照片.${format.extension}`,
      createdAt: new Date().toISOString(),
    },
  };
});

router.put("/api/sections/meeting/plan", requireAuth, async (ctx) => {
  const body = ctx.request.body || {};
  const date = cleanString(body.date, 10);
  const time = cleanString(body.time, 5);
  const place = cleanString(body.place, MAX_PLACE_LENGTH);
  const note = cleanString(body.note, MAX_PLAN_NOTE_LENGTH);

  if (!date && !time && !place && !note) {
    board.meeting.plan = createEmptyPlan();
    await persistBoard();
    ctx.body = { board };
    return;
  }

  if (!isValidDate(date)) {
    ctx.throw(400, "先选好下一次见面的日期");
  }

  if (time && !isValidTime(time)) {
    ctx.throw(400, "见面的时间格式不太对");
  }

  board.meeting.plan = {
    date,
    time,
    place,
    note,
    updatedAt: new Date().toISOString(),
  };

  await persistBoard();
  ctx.body = { board };
});

router.post("/api/sections/:section/todos", requireAuth, async (ctx) => {
  const section = getSection(ctx);
  const text = cleanString(ctx.request.body?.text, MAX_TODO_LENGTH);

  if (!text) ctx.throw(400, "写点什么再添加待办吧");

  const todo = {
    id: randomUUID(),
    text,
    done: false,
    createdAt: new Date().toISOString(),
  };

  section.todos.push(todo);
  await persistBoard();
  ctx.status = 201;
  ctx.body = { board };
});

router.patch("/api/sections/:section/todos/:id", requireAuth, async (ctx) => {
  const { todo } = getTodo(ctx);
  const body = ctx.request.body || {};

  if (typeof body.done === "boolean") {
    todo.done = body.done;
  }

  if (body.text !== undefined) {
    const text = cleanString(body.text, MAX_TODO_LENGTH);
    if (!text) ctx.throw(400, "待办内容不能为空");
    todo.text = text;
  }

  await persistBoard();
  ctx.body = { board };
});

router.delete("/api/sections/:section/todos/:id", requireAuth, async (ctx) => {
  const { section, todo } = getTodo(ctx);
  section.todos = section.todos.filter((item) => item.id !== todo.id);
  await persistBoard();
  ctx.body = { board };
});

router.post("/api/sections/:section/notes", requireAuth, async (ctx) => {
  const section = getSection(ctx);
  const body = ctx.request.body || {};
  const title = cleanString(body.title, MAX_TITLE_LENGTH);
  const content = String(body.content ?? "").slice(0, MAX_CONTENT_LENGTH);
  const rawImages = Array.isArray(body.images) ? body.images : [];

  if (rawImages.length > MAX_IMAGES_PER_NOTE) {
    ctx.throw(400, `一页笔记最多放 ${MAX_IMAGES_PER_NOTE} 张照片`);
  }

  const images = sanitizeImageList(rawImages);

  if (!title && !content.trim() && images.length === 0) {
    ctx.throw(400, "写下一句话或插入一张照片，再保存这一页吧");
  }

  const now = new Date().toISOString();
  const note = {
    id: randomUUID(),
    title: title || "未命名的一页",
    content,
    images,
    createdAt: now,
    updatedAt: now,
  };

  section.notes.unshift(note);
  await persistBoard();
  ctx.status = 201;
  ctx.body = { board, note };
});

router.patch("/api/sections/:section/notes/:id", requireAuth, async (ctx) => {
  const { note } = getNote(ctx);
  const body = ctx.request.body || {};
  let removedImages = [];

  if (body.title !== undefined) {
    note.title = cleanString(body.title, MAX_TITLE_LENGTH) || "未命名的一页";
  }

  if (body.content !== undefined) {
    note.content = String(body.content).slice(0, MAX_CONTENT_LENGTH);
  }

  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) {
      ctx.throw(400, "图片列表格式不正确");
    }

    if (body.images.length > MAX_IMAGES_PER_NOTE) {
      ctx.throw(400, `一页笔记最多放 ${MAX_IMAGES_PER_NOTE} 张照片`);
    }

    const nextImages = sanitizeImageList(body.images);
    removedImages = (note.images ?? []).filter(
      (image) => !nextImages.some((nextImage) => nextImage.url === image.url),
    );
    note.images = nextImages;
  }

  note.updatedAt = new Date().toISOString();
  await persistBoard();
  await removeImageFiles(removedImages);
  ctx.body = { board, note };
});

router.delete("/api/sections/:section/notes/:id", requireAuth, async (ctx) => {
  const { section, note } = getNote(ctx);
  const imagesToRemove = [...(note.images ?? [])];
  section.notes = section.notes.filter((item) => item.id !== note.id);
  await persistBoard();
  await removeImageFiles(imagesToRemove);
  ctx.body = { board };
});

app.use(router.routes());
app.use(router.allowedMethods());

let hasBuiltFrontend = false;

try {
  await fs.access(path.join(DIST_DIR, "index.html"));
  hasBuiltFrontend = true;
} catch {
  hasBuiltFrontend = false;
}

if (hasBuiltFrontend) {
  app.use(serve(DIST_DIR, { index: "index.html" }));
  app.use(async (ctx, next) => {
    if (
      ctx.method === "GET" &&
      !ctx.path.startsWith("/api") &&
      ctx.accepts("html") &&
      !path.extname(ctx.path)
    ) {
      ctx.type = "html";
      ctx.body = createReadStream(path.join(DIST_DIR, "index.html"));
      return;
    }
    await next();
  });
} else {
  app.use(async (ctx) => {
    if (ctx.path === "/") {
      ctx.body = "API is running. 请先执行 pnpm build，或使用 pnpm dev 启动 Vue 开发服务器。";
      return;
    }
    ctx.status = 404;
  });
}

await fs.mkdir(UPLOAD_DIR, { recursive: true });
await loadBoard();

app.listen(PORT, HOST, () => {
  console.log(`♥ Our private story is running at http://${HOST}:${PORT}`);
  console.log(`   API ready · ${hasBuiltFrontend ? "Vue build served" : "Vue dev server not built"}`);
});
