<script setup>
import { computed, nextTick, reactive, ref } from "vue";
import LockScene from "./components/LockScene.vue";
import LoginModal from "./components/LoginModal.vue";
import DashboardView from "./components/DashboardView.vue";
import NoteEditor from "./components/NoteEditor.vue";
import MeetingPlanDialog from "./components/MeetingPlanDialog.vue";
import LoveEasterEgg from "./components/LoveEasterEgg.vue";
import MemoryWall from "./components/MemoryWall.vue";
import {
  createNote,
  createTodo,
  deleteNote,
  deleteTodo,
  fetchBoard,
  login,
  logout,
  setAuthToken,
  updateMeetingPlan,
  updateNote,
  updateTodo,
} from "./api";
import { sectionById } from "./data/sections";

const emptyPlan = () => ({ date: "", time: "", place: "", note: "", updatedAt: null });

const emptyBoard = () => ({
  meeting: { plan: emptyPlan(), todos: [], notes: [] },
  travel: { todos: [], notes: [] },
  wish: { todos: [], notes: [] },
});

const defaultTitle = document.title;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const timings = reducedMotion.matches
  ? { success: 60, open: 80, relock: 80 }
  : { success: 680, open: 920, relock: 780 };

const phase = ref("locked");
const loginOpen = ref(false);
const loginLoading = ref(false);
const loginSuccess = ref(false);
const loginError = ref("");
const board = ref(emptyBoard());
const toastMessage = ref("");
const noteSaving = ref(false);
const planDialogOpen = ref(false);
const planSaving = ref(false);
const loveEggActive = ref(false);
const memoryWallOpen = ref(false);

const noteEditor = reactive({
  open: false,
  sectionId: "",
  isNew: true,
  note: null,
});

let toastTimer = null;
let lastFocusedBeforeEditor = null;

const pageInert = computed(
  () => loginOpen.value || !["locked", "login"].includes(phase.value),
);
const noteSectionTitle = computed(
  () => sectionById[noteEditor.sectionId]?.title ?? "",
);

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toastMessage.value = message;
  toastTimer = window.setTimeout(() => {
    toastMessage.value = "";
  }, 3200);
}

function openLogin() {
  if (phase.value !== "locked") return;

  phase.value = "login";
  loginOpen.value = true;
  loginLoading.value = false;
  loginSuccess.value = false;
  loginError.value = "";
}

function closeLogin() {
  if (loginLoading.value || loginSuccess.value) return;

  loginOpen.value = false;
  loginError.value = "";
  phase.value = "locked";

  window.setTimeout(() => {
    document.getElementById("lockTrigger")?.focus({ preventScroll: true });
  }, reducedMotion.matches ? 20 : 380);
}

async function handleLogin(passcode) {
  if (loginLoading.value || loginSuccess.value) return;

  loginLoading.value = true;
  loginError.value = "";

  try {
    const auth = await login(passcode);
    setAuthToken(auth.token);
    const data = await fetchBoard();
    board.value = data.board;

    loginLoading.value = false;
    loginSuccess.value = true;

    await wait(timings.success);
    loginOpen.value = false;
    phase.value = "opening";

    await wait(timings.open);
    phase.value = "unlocked";
    document.title = "我们的秘密基地 · The Story of Us";
  } catch (error) {
    setAuthToken("");
    loginLoading.value = false;
    loginError.value = error.message || "这扇门暂时打不开，请再试一次。";
  }
}

async function relock() {
  if (phase.value !== "unlocked") return;

  phase.value = "relocking";
  noteEditor.open = false;
  planDialogOpen.value = false;
  memoryWallOpen.value = false;
  document.body.classList.remove("is-note-open");
  document.title = defaultTitle;

  try {
    await logout();
  } catch {
    // The local lock still works even if the session already expired.
  }

  await wait(timings.relock);

  phase.value = "locked";
  board.value = emptyBoard();
  setAuthToken("");

  window.setTimeout(() => {
    document.getElementById("lockTrigger")?.focus({ preventScroll: true });
  }, 40);
}

function handleApiError(error) {
  const message = error?.message || "刚刚没有保存成功，请再试一次。";

  if (error?.status === 401) {
    showToast("登录状态已失效，请重新开门。");
    relock();
    return;
  }

  showToast(message);
}

async function addTodo({ sectionId, text }) {
  try {
    const data = await createTodo(sectionId, text);
    board.value = data.board;
    showToast("待办已经写进计划里。");
  } catch (error) {
    handleApiError(error);
  }
}

async function toggleTodo({ sectionId, todo }) {
  const target = board.value[sectionId]?.todos?.find((item) => item.id === todo.id);
  if (!target) return;

  const nextDone = !target.done;
  target.done = nextDone;

  try {
    const data = await updateTodo(sectionId, todo.id, { done: nextDone });
    board.value = data.board;
  } catch (error) {
    target.done = !nextDone;
    handleApiError(error);
  }
}

async function removeTodo({ sectionId, todo }) {
  try {
    const data = await deleteTodo(sectionId, todo.id);
    board.value = data.board;
    showToast("这条待办已经删掉了。");
  } catch (error) {
    handleApiError(error);
  }
}

function openNewNote(sectionId) {
  lastFocusedBeforeEditor = document.activeElement;
  noteEditor.sectionId = sectionId;
  noteEditor.isNew = true;
  noteEditor.note = {
    id: null,
    title: "",
    content: "",
    createdAt: null,
    updatedAt: null,
  };
  noteEditor.open = true;
  document.body.classList.add("is-note-open");
}

function openExistingNote({ sectionId, note }) {
  lastFocusedBeforeEditor = document.activeElement;
  noteEditor.sectionId = sectionId;
  noteEditor.isNew = false;
  noteEditor.note = note;
  noteEditor.open = true;
  document.body.classList.add("is-note-open");
}

function restoreEditorFocus() {
  nextTick(() => {
    if (lastFocusedBeforeEditor?.isConnected) {
      lastFocusedBeforeEditor.focus({ preventScroll: true });
    } else {
      document.querySelector(".dashboard__relock")?.focus({ preventScroll: true });
    }
  });
}

function closeEditor(force = false) {
  if (noteSaving.value && !force) return;

  noteEditor.open = false;
  document.body.classList.remove("is-note-open");
  restoreEditorFocus();
}

async function saveNote({ title, content, images = [], closeAfter = false }) {
  if (noteSaving.value) return;

  noteSaving.value = true;

  try {
    let data;

    if (noteEditor.isNew) {
      data = await createNote(noteEditor.sectionId, { title, content, images });
      noteEditor.isNew = false;
      noteEditor.note = data.note;
    } else {
      data = await updateNote(noteEditor.sectionId, noteEditor.note.id, {
        title,
        content,
        images,
      });
      const savedNote = data.board[noteEditor.sectionId].notes.find(
        (note) => note.id === data.note.id,
      );
      noteEditor.note = savedNote || data.note;
    }

    board.value = data.board;
    showToast("这一页已经好好收起来了。");

    if (closeAfter) {
      closeEditor(true);
    }
  } catch (error) {
    handleApiError(error);
  } finally {
    noteSaving.value = false;
  }
}

async function removeCurrentNote() {
  if (noteSaving.value || noteEditor.isNew || !noteEditor.note?.id) return;

  noteSaving.value = true;

  try {
    const data = await deleteNote(noteEditor.sectionId, noteEditor.note.id);
    board.value = data.board;
    noteEditor.open = false;
    document.body.classList.remove("is-note-open");
    showToast("这一页已经被删掉了。");
    restoreEditorFocus();
  } catch (error) {
    handleApiError(error);
  } finally {
    noteSaving.value = false;
  }
}

async function removeNoteFromCard({ sectionId, note }) {
  try {
    const data = await deleteNote(sectionId, note.id);
    board.value = data.board;
    showToast("这一页已经被删掉了。");
  } catch (error) {
    handleApiError(error);
  }
}

function openMeetingPlan() {
  if (phase.value !== "unlocked" || noteSaving.value) return;
  planDialogOpen.value = true;
}

function closeMeetingPlan() {
  if (planSaving.value) return;
  planDialogOpen.value = false;
}

async function saveMeetingPlan(plan) {
  if (planSaving.value) return;

  planSaving.value = true;

  try {
    const data = await updateMeetingPlan(plan);
    board.value = data.board;
    planDialogOpen.value = false;
    showToast(
      data.board.meeting.plan?.date
        ? "下一次见面的日子，已经收好了。"
        : "见面计划已经清空。",
    );
  } catch (error) {
    handleApiError(error);
  } finally {
    planSaving.value = false;
  }
}

function clearMeetingPlan() {
  return saveMeetingPlan({ date: "", time: "", place: "", note: "" });
}

function playLoveEgg() {
  if (loveEggActive.value) return;
  loveEggActive.value = true;
}

function finishLoveEgg() {
  loveEggActive.value = false;
}

function openMemoryWall() {
  if (phase.value !== "unlocked") return;

  memoryWallOpen.value = true;
  document.title = "纪念照片墙 · The Story of Us";
}

function closeMemoryWall() {
  memoryWallOpen.value = false;
  document.title = "我们的秘密基地 · The Story of Us";

  nextTick(() => {
    document.querySelector(".dashboard__seal--button")?.focus({ preventScroll: true });
  });
}
</script>

<template>
  <LockScene
    :unlocking="['opening', 'unlocked', 'relocking'].includes(phase)"
    :inert="pageInert"
    @open="openLogin"
    @love-egg="playLoveEgg"
  />

  <LoginModal
    :open="loginOpen"
    :loading="loginLoading"
    :success="loginSuccess"
    :error="loginError"
    @submit="handleLogin"
    @close="closeLogin"
    @forgot="showToast('去问问那个最爱你的人吧 ♡')"
    @clear-error="loginError = ''"
  />

  <DashboardView
    :visible="phase === 'unlocked'"
    :board="board"
    :inert="phase !== 'unlocked' || noteEditor.open || planDialogOpen || memoryWallOpen"
    @relock="relock"
    @add-todo="addTodo"
    @toggle-todo="toggleTodo"
    @delete-todo="removeTodo"
    @add-note="openNewNote"
    @open-note="openExistingNote"
    @delete-note="removeNoteFromCard"
    @edit-plan="openMeetingPlan"
    @love-egg="playLoveEgg"
    @open-memory-wall="openMemoryWall"
  />

  <MeetingPlanDialog
    :open="planDialogOpen"
    :plan="board.meeting.plan"
    :saving="planSaving"
    @save="saveMeetingPlan"
    @clear="clearMeetingPlan"
    @close="closeMeetingPlan"
  />

  <NoteEditor
    :open="noteEditor.open"
    :note="noteEditor.note"
    :is-new="noteEditor.isNew"
    :section-title="noteSectionTitle"
    :saving="noteSaving"
    @save="saveNote"
    @delete="removeCurrentNote"
    @close="closeEditor"
    @error="handleApiError"
  />

  <Transition name="memory-wall-view">
    <MemoryWall
      v-if="memoryWallOpen"
      @close="closeMemoryWall"
      @error="handleApiError"
      @notice="showToast"
    />
  </Transition>

  <Transition name="love-egg-fade">
    <LoveEasterEgg v-if="loveEggActive" @finished="finishLoveEgg" />
  </Transition>

  <Transition name="toast-fade">
    <div v-if="toastMessage" class="toast is-visible" role="status" aria-live="polite">
      {{ toastMessage }}
    </div>
  </Transition>
</template>
