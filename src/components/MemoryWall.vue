<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  createMemory,
  deleteMemory,
  fetchMemories,
  updateMemory,
  uploadImage,
} from "../api";
import { prepareImageForUpload } from "../utils/images";

const emit = defineEmits(["close", "error", "notice"]);

const MAX_MEMORIES = 120;

const memories = ref([]);
const loading = ref(true);
const uploadingCount = ref(0);
const canvasEl = ref(null);
const canvasWidth = ref(0);
const canvasHeight = ref(0);
const photoSize = ref(152);
const backButton = ref(null);
const fileInput = ref(null);
const draggingId = ref(null);
const rotatingId = ref(null);
const previewMemory = ref(null);
const contextMenu = ref(null);

let maxZ = 0;
let dragState = null;
let rotateState = null;
let rotateHoldTimer = null;
let resizeObserver = null;
let menuListenerAttached = false;

const hasMemories = computed(() => memories.value.length > 0);
const countLabel = computed(() => `已贴 ${memories.value.length} 张`);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRotation(value) {
  return (((value + 180) % 360) + 360) % 360 - 180;
}

function photoSizeForViewport() {
  if (window.innerWidth <= 420) return 104;
  if (window.innerWidth <= 700) return 118;
  return 152;
}

function updateLayout() {
  photoSize.value = photoSizeForViewport();

  if (!canvasEl.value) return;

  canvasWidth.value = canvasEl.value.clientWidth;
  canvasHeight.value = canvasEl.value.clientHeight;
}

function photoStyle(memory) {
  const travelX = Math.max(0, canvasWidth.value - photoSize.value);
  const travelY = Math.max(0, canvasHeight.value - photoSize.value);

  return {
    left: `${memory.x * travelX}px`,
    top: `${memory.y * travelY}px`,
    width: `${photoSize.value}px`,
    height: `${photoSize.value}px`,
    transform: `rotate(${memory.rotation}deg)`,
    zIndex: String(memory.z),
  };
}

async function loadMemories() {
  loading.value = true;

  try {
    const data = await fetchMemories();
    memories.value = data.memories ?? [];
    maxZ = Math.max(0, ...memories.value.map((memory) => Number(memory.z) || 0));
  } catch (error) {
    emit("error", error);
  } finally {
    loading.value = false;
  }
}

function randomPlacement() {
  return {
    x: 0.1 + Math.random() * 0.8,
    y: 0.08 + Math.random() * 0.76,
    rotation: Math.round((Math.random() * 16 - 8) * 10) / 10,
  };
}

function openFilePicker() {
  if (uploadingCount.value > 0) return;
  fileInput.value?.click();
}

async function handleFileChange(event) {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";
  await uploadFiles(files);
}

async function uploadFiles(files) {
  const images = files.filter((file) => file?.type?.startsWith("image/"));
  if (!images.length) return;

  const available = MAX_MEMORIES - memories.value.length;

  if (available <= 0) {
    emit("notice", `纪念墙最多放 ${MAX_MEMORIES} 张照片。`);
    return;
  }

  const selected = images.slice(0, available);
  if (images.length > available) {
    emit("notice", `墙上最多放 ${MAX_MEMORIES} 张照片，先放前 ${available} 张。`);
  }

  uploadingCount.value += selected.length;
  let uploaded = 0;

  for (const file of selected) {
    try {
      const prepared = await prepareImageForUpload(file);
      const image = await uploadImage(prepared.blob, prepared.name);
      const placement = randomPlacement();
      const data = await createMemory({
        image,
        x: placement.x,
        y: placement.y,
        rotation: placement.rotation,
      });

      memories.value.push(data.memory);
      maxZ = Math.max(maxZ, Number(data.memory.z) || 0);
      uploaded += 1;
    } catch (error) {
      if (error?.status === 401) {
        emit("error", error);
        break;
      }
      emit("error", error);
    } finally {
      uploadingCount.value -= 1;
    }
  }

  if (uploaded > 0) {
    emit("notice", `已经收好 ${uploaded} 张照片。`);
  }
}

function startDrag(event, memory) {
  if (event.button !== 0) return;
  if (event.target.closest("button")) return;

  event.preventDefault();
  closeContextMenu();

  maxZ += 1;
  memory.z = maxZ;

  const travelX = Math.max(0, canvasWidth.value - photoSize.value);
  const travelY = Math.max(0, canvasHeight.value - photoSize.value);

  dragState = {
    memory,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: memory.x * travelX,
    startTop: memory.y * travelY,
    travelX,
    travelY,
  };

  draggingId.value = memory.id;
  document.body.classList.add("is-memory-dragging");

  try {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  } catch {
    // Pointer capture is not essential for dragging.
  }

  window.addEventListener("pointermove", handleDragMove, { passive: false });
  window.addEventListener("pointerup", endDrag, { once: true });
  window.addEventListener("pointercancel", endDrag, { once: true });
}

function handleDragMove(event) {
  if (!dragState) return;

  event.preventDefault();

  const left = clamp(
    dragState.startLeft + event.clientX - dragState.startX,
    0,
    dragState.travelX,
  );
  const top = clamp(
    dragState.startTop + event.clientY - dragState.startY,
    0,
    dragState.travelY,
  );

  dragState.memory.x = dragState.travelX ? left / dragState.travelX : 0;
  dragState.memory.y = dragState.travelY ? top / dragState.travelY : 0;
}

function endDrag() {
  window.removeEventListener("pointermove", handleDragMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  document.body.classList.remove("is-memory-dragging");

  if (!dragState) return;

  const memory = dragState.memory;
  dragState = null;
  draggingId.value = null;

  updateMemory(memory.id, {
    x: memory.x,
    y: memory.y,
    z: memory.z,
    rotation: memory.rotation,
  }).catch((error) => emit("error", error));
}

function startRotate(event, memory) {
  if (event.button !== 0) return;

  if (rotateState) stopRotate();

  closeContextMenu();

  const button = event.currentTarget;
  rotateState = {
    memory,
    button,
    pointerId: event.pointerId,
    frame: null,
    lastTime: 0,
    dirty: false,
  };
  rotatingId.value = memory.id;

  try {
    button.setPointerCapture?.(event.pointerId);
  } catch {
    // Pointer capture is not essential for rotation.
  }

  window.addEventListener("pointerup", stopRotate, { once: true });
  window.addEventListener("pointercancel", stopRotate, { once: true });

  window.clearTimeout(rotateHoldTimer);
  rotateHoldTimer = window.setTimeout(() => {
    if (!rotateState) return;

    rotateState.lastTime = performance.now();

    const tick = (time) => {
      if (!rotateState) return;

      const elapsed = Math.min(50, time - rotateState.lastTime);
      rotateState.lastTime = time;
      rotateState.memory.rotation = normalizeRotation(
        rotateState.memory.rotation + elapsed * 0.085,
      );
      rotateState.dirty = true;
      rotateState.frame = window.requestAnimationFrame(tick);
    };

    rotateState.frame = window.requestAnimationFrame(tick);
  }, 110);
}

function stopRotate() {
  window.clearTimeout(rotateHoldTimer);

  if (!rotateState) {
    rotatingId.value = null;
    window.removeEventListener("pointerup", stopRotate);
    window.removeEventListener("pointercancel", stopRotate);
    return;
  }

  window.cancelAnimationFrame(rotateState.frame);
  window.removeEventListener("pointerup", stopRotate);
  window.removeEventListener("pointercancel", stopRotate);

  const { memory, button, pointerId, dirty } = rotateState;
  rotateState = null;
  rotatingId.value = null;

  try {
    button.releasePointerCapture?.(pointerId);
  } catch {
    // The browser may already have released the capture.
  }

  if (dirty) {
    updateMemory(memory.id, { rotation: memory.rotation }).catch((error) =>
      emit("error", error),
    );
  }
}

function openPreview(memory) {
  if (!memory) return;
  closeContextMenu();
  previewMemory.value = memory;
}

function closePreview() {
  previewMemory.value = null;
}

function openContextMenu(event, memory) {
  event.preventDefault();
  closeContextMenu();

  const menuWidth = 170;
  const menuHeight = 94;

  contextMenu.value = {
    x: Math.min(event.clientX, window.innerWidth - menuWidth - 12),
    y: Math.min(event.clientY, window.innerHeight - menuHeight - 12),
    memory,
  };

  window.setTimeout(() => {
    if (!contextMenu.value) return;
    window.addEventListener("pointerdown", closeContextMenu, { once: true });
    menuListenerAttached = true;
  }, 0);
}

function closeContextMenu() {
  contextMenu.value = null;

  if (menuListenerAttached) {
    window.removeEventListener("pointerdown", closeContextMenu);
    menuListenerAttached = false;
  }
}

async function removeMemory(memory) {
  if (!memory) return;

  closeContextMenu();

  try {
    await deleteMemory(memory.id);
    memories.value = memories.value.filter((item) => item.id !== memory.id);

    if (previewMemory.value?.id === memory.id) {
      previewMemory.value = null;
    }

    emit("notice", "这张照片已经移出纪念墙。");
  } catch (error) {
    emit("error", error);
  }
}

function removePreviewMemory() {
  if (previewMemory.value) removeMemory(previewMemory.value);
}

function previewFromContextMenu() {
  const memory = contextMenu.value?.memory;
  closeContextMenu();
  openPreview(memory);
}

function deleteFromContextMenu() {
  const memory = contextMenu.value?.memory;
  removeMemory(memory);
}

function closeWall() {
  emit("close");
}

function handleKeydown(event) {
  if (event.key !== "Escape") return;

  if (contextMenu.value) {
    event.preventDefault();
    closeContextMenu();
    return;
  }

  if (previewMemory.value) {
    event.preventDefault();
    closePreview();
    return;
  }

  event.preventDefault();
  closeWall();
}

onMounted(async () => {
  document.body.classList.add("is-memory-wall-open");
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", updateLayout);

  await nextTick();
  updateLayout();

  if (canvasEl.value) {
    resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(canvasEl.value);
  }

  backButton.value?.focus({ preventScroll: true });
  await loadMemories();
  updateLayout();
});

onBeforeUnmount(() => {
  window.clearTimeout(rotateHoldTimer);
  if (rotateState) stopRotate();
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("resize", updateLayout);
  window.removeEventListener("pointermove", handleDragMove);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  window.removeEventListener("pointerdown", closeContextMenu);
  resizeObserver?.disconnect();
  document.body.classList.remove("is-memory-dragging", "is-memory-wall-open");
});
</script>

<template>
  <section class="memory-wall">
    <header class="memory-wall__topbar">
      <button ref="backButton" class="memory-wall__back" type="button" @click="closeWall">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M15 10H5M9 6l-4 4 4 4" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        返回我们的故事
      </button>

      <div class="memory-wall__title">
        <p><span aria-hidden="true">✦</span> Our memory wall</p>
        <h1>纪念照片墙</h1>
      </div>

      <div class="memory-wall__actions">
        <span class="memory-wall__count">{{ countLabel }}</span>
        <button
          class="memory-wall__upload"
          type="button"
          :disabled="uploadingCount > 0"
          @click="openFilePicker"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 6.5h3l1.2-2h3.6l1.2 2h3A1.5 1.5 0 0 1 17.5 8v7A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15V8A1.5 1.5 0 0 1 4 6.5Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
            <circle cx="10" cy="11.2" r="3" stroke="currentColor" stroke-width="1.1"/>
          </svg>
          {{ uploadingCount > 0 ? "上传中…" : "上传照片" }}
        </button>
      </div>
    </header>

    <main ref="canvasEl" class="memory-wall__canvas">
      <div v-if="loading" class="memory-wall__loading">
        <span class="memory-wall__loading-dot" aria-hidden="true"></span>
        正在翻开照片墙…
      </div>

      <div v-else-if="!hasMemories" class="memory-wall__empty">
        <span class="memory-wall__empty-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="7" y="9" width="34" height="30" rx="4" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="17" cy="18" r="3" stroke="currentColor" stroke-width="1.1"/>
            <path d="m10.5 34 9.5-10 6.5 6 5-4 6 8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <p class="memory-wall__empty-eyebrow">A blank page for our memories</p>
        <h2>这里还是一张空白页</h2>
        <p class="memory-wall__empty-copy">上传一张照片，把想留住的瞬间钉在这里。</p>
        <button class="memory-wall__empty-button" type="button" @click="openFilePicker">
          上传第一张照片
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <template v-else>
        <article
          v-for="memory in memories"
          :key="memory.id"
          class="memory-photo"
          :class="{
            'is-dragging': draggingId === memory.id,
            'is-rotating': rotatingId === memory.id,
          }"
          :style="photoStyle(memory)"
          @pointerdown="startDrag($event, memory)"
          @contextmenu.prevent="openContextMenu($event, memory)"
        >
          <img
            :src="memory.image.url"
            :alt="memory.image.name || '纪念照片'"
            draggable="false"
          />

          <button
            class="memory-photo__zoom"
            type="button"
            :aria-label="`放大查看 ${memory.image.name || '这张照片'}`"
            title="放大查看"
            @pointerdown.stop
            @click.stop="openPreview(memory)"
          >
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="7.7" cy="7.7" r="4.7" stroke="currentColor" stroke-width="1.25"/>
              <path d="m11.3 11.3 3.4 3.4M5.2 7.7h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>

          <button
            class="memory-photo__rotate"
            type="button"
            :aria-label="`长按旋转 ${memory.image.name || '这张照片'}`"
            title="长按旋转"
            @pointerdown.stop.prevent="startRotate($event, memory)"
            @click.stop
          >
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M14.4 7.4A5.6 5.6 0 1 0 14.8 11" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>
              <path d="M14.6 4.4v3.2h-3.2" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </article>
      </template>
    </main>

    <footer class="memory-wall__hint">
      拖动摆放 · 长按 ↻ 流畅旋转 · 右键删除 · 点放大镜看大图
    </footer>

    <input
      ref="fileInput"
      class="memory-wall__file-input"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      multiple
      @change="handleFileChange"
    />

    <Transition name="memory-preview">
      <div v-if="previewMemory" class="memory-preview" @click.self="closePreview">
        <button class="memory-preview__close" type="button" aria-label="关闭大图" @click="closePreview">
          <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M5 5l12 12M17 5 5 17" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>

        <div class="memory-preview__frame">
          <img
            :src="previewMemory.image.url"
            :alt="previewMemory.image.name || '纪念照片'"
          />
          <div class="memory-preview__meta">
            <span>{{ previewMemory.image.name || "我们的纪念" }}</span>
            <button type="button" class="memory-preview__delete" @click="removePreviewMemory">
              删除这张照片
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="memory-menu">
      <div
        v-if="contextMenu"
        class="memory-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        role="menu"
        @pointerdown.stop
      >
        <button type="button" role="menuitem" @click="previewFromContextMenu">
          放大查看
        </button>
        <button
          type="button"
          class="is-danger"
          role="menuitem"
          @click="deleteFromContextMenu"
        >
          删除这张照片
        </button>
      </div>
    </Transition>
  </section>
</template>
