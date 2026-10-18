let authToken = "";

export function setAuthToken(token) {
  authToken = token || "";
}

async function request(path, { method = "GET", body } = {}) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response;

  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const error = new Error("暂时连不上秘密基地，请确认服务已经启动。");
    error.status = 0;
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `请求没有成功（${response.status}）`);
    error.status = response.status;
    throw error;
  }

  return data;
}

export function login(passcode) {
  return request("/login", { method: "POST", body: { passcode } });
}

export function logout() {
  return request("/logout", { method: "POST" });
}

export function fetchBoard() {
  return request("/board");
}

export function fetchMemories() {
  return request("/memories");
}

export function createMemory(memory) {
  return request("/memories", {
    method: "POST",
    body: memory,
  });
}

export function updateMemory(id, patch) {
  return request(`/memories/${id}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteMemory(id) {
  return request(`/memories/${id}`, {
    method: "DELETE",
  });
}

export async function uploadImage(blob, filename) {
  const headers = {
    "Content-Type": blob.type || "application/octet-stream",
    "X-File-Name": encodeURIComponent(filename || "photo"),
  };

  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let response;

  try {
    response = await fetch("/api/uploads", {
      method: "POST",
      headers,
      body: blob,
    });
  } catch {
    const error = new Error("照片没有传上去，请检查网络后再试。");
    error.status = 0;
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "照片没有传上去，请再试一次。");
    error.status = response.status;
    throw error;
  }

  return data.image;
}

export function updateMeetingPlan(plan) {
  return request("/sections/meeting/plan", {
    method: "PUT",
    body: plan,
  });
}

export function createTodo(sectionId, text) {
  return request(`/sections/${sectionId}/todos`, {
    method: "POST",
    body: { text },
  });
}

export function updateTodo(sectionId, todoId, patch) {
  return request(`/sections/${sectionId}/todos/${todoId}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteTodo(sectionId, todoId) {
  return request(`/sections/${sectionId}/todos/${todoId}`, {
    method: "DELETE",
  });
}

export function createNote(sectionId, note) {
  return request(`/sections/${sectionId}/notes`, {
    method: "POST",
    body: note,
  });
}

export function updateNote(sectionId, noteId, patch) {
  return request(`/sections/${sectionId}/notes/${noteId}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteNote(sectionId, noteId) {
  return request(`/sections/${sectionId}/notes/${noteId}`, {
    method: "DELETE",
  });
}
