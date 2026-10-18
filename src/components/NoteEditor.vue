<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { uploadImage } from "../api";
import { prepareImageForUpload } from "../utils/images";

const props = defineProps({
  open: { type: Boolean, default: false },
  note: { type: Object, default: null },
  isNew: { type: Boolean, default: false },
  sectionTitle: { type: String, default: "" },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(["save", "delete", "close", "error"]);

const MAX_IMAGES = 12;
const titleInput = ref(null);
const contentInput = ref(null);
const fileInput = ref(null);
const localTitle = ref("");
const localContent = ref("");
const localImages = ref([]);
const originalTitle = ref("");
const originalContent = ref("");
const originalImages = ref([]);
const deleteArmed = ref(false);
const uploadingCount = ref(0);
const mediaError = ref("");

let deleteTimer = null;
let focusTimer = null;
const reducedMotion =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

const imageKey = (images) =>
  (images ?? []).map((image) => image.url).join("|");

const hasContent = computed(
  () =>
    Boolean(localTitle.value.trim() || localContent.value.trim()) ||
    localImages.value.length > 0,
);
const isDirty = computed(
  () =>
    localTitle.value !== originalTitle.value ||
    localContent.value !== originalContent.value ||
    imageKey(localImages.value) !== imageKey(originalImages.value),
);
const canSave = computed(() => hasContent.value && !props.saving);
const updatedLabel = computed(() => {
  if (props.isNew) return "新的一页";
  const value = props.note?.updatedAt;
  if (!value) return "刚刚写下";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚写下";
  return `最后修改 · ${date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })}`;
});

function resizeContent() {
  nextTick(() => {
    const element = contentInput.value;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(280, element.scrollHeight)}px`;
  });
}

function resizeTitle() {
  nextTick(() => {
    const element = titleInput.value;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  });
}

function resetDeleteConfirmation() {
  deleteArmed.value = false;
  window.clearTimeout(deleteTimer);
}

watch(
  () => props.open,
  async (open) => {
    window.clearTimeout(focusTimer);

    if (!open) {
      resetDeleteConfirmation();
      return;
    }

    localTitle.value = props.note?.title ?? "";
    localContent.value = props.note?.content ?? "";
    localImages.value = (props.note?.images ?? []).map((image) => ({ ...image }));
    originalTitle.value = props.note?.title ?? "";
    originalContent.value = props.note?.content ?? "";
    originalImages.value = (props.note?.images ?? []).map((image) => ({ ...image }));
    uploadingCount.value = 0;
    mediaError.value = "";
    resetDeleteConfirmation();

    await nextTick();
    resizeTitle();
    resizeContent();
    focusTimer = window.setTimeout(() => {
      titleInput.value?.focus({ preventScroll: true });
      const length = localTitle.value.length;
      try {
        titleInput.value?.setSelectionRange(length, length);
      } catch {
        // Selection helpers are unavailable in some mobile webviews.
      }
    }, reducedMotion?.matches ? 20 : 360);
  },
);

watch(
  () => props.note,
  (note) => {
    if (!props.open || !note) return;
    originalTitle.value = note.title ?? "";
    originalContent.value = note.content ?? "";
    originalImages.value = (note.images ?? []).map((image) => ({ ...image }));
  },
  { deep: true },
);

watch(localTitle, resizeTitle);
watch(localContent, resizeContent);

function payload(closeAfter = false) {
  return {
    title: localTitle.value,
    content: localContent.value,
    images: localImages.value.map(({ url, name, createdAt }) => ({
      url,
      name,
      createdAt,
    })),
    closeAfter,
  };
}

function submit(closeAfter = false) {
  if (!canSave.value) return;
  emit("save", payload(closeAfter));
}

function requestClose() {
  if (props.saving) return;

  if (uploadingCount.value > 0) {
    mediaError.value = "照片还在上传，等它放好再离开吧。";
    return;
  }

  if (!hasContent.value) {
    emit("close");
    return;
  }

  if (props.isNew || isDirty.value) {
    emit("save", payload(true));
    return;
  }

  emit("close");
}

function focusContent() {
  contentInput.value?.focus({ preventScroll: true });
  const end = localContent.value.length;
  try {
    contentInput.value?.setSelectionRange(end, end);
  } catch {
    // Selection helpers are unavailable in some mobile webviews.
  }
}

function openFilePicker() {
  if (uploadingCount.value > 0) return;
  fileInput.value?.click();
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList ?? []).filter((file) =>
    file?.type?.startsWith("image/"),
  );

  if (!files.length) return;

  const available = MAX_IMAGES - localImages.value.length - uploadingCount.value;

  if (available <= 0) {
    mediaError.value = `一页笔记最多放 ${MAX_IMAGES} 张照片。`;
    return;
  }

  const chosenFiles = files.slice(0, available);
  if (files.length > available) {
    mediaError.value = `一页笔记最多放 ${MAX_IMAGES} 张照片，已经先放入前 ${available} 张。`;
  } else {
    mediaError.value = "";
  }

  uploadingCount.value += chosenFiles.length;

  for (const file of chosenFiles) {
    try {
      const prepared = await prepareImageForUpload(file);
      const image = await uploadImage(prepared.blob, prepared.name);
      localImages.value.push({
        ...image,
        name: prepared.name || image.name,
      });
    } catch (error) {
      if (error?.status === 401) {
        emit("error", error);
        break;
      }
      mediaError.value = error?.message || "照片没有放进来，请再试一次。";
    } finally {
      uploadingCount.value -= 1;
    }
  }
}

function handleFileChange(event) {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";
  uploadFiles(files);
}

function handlePaste(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const files = [];

  if (clipboard.items?.length) {
    for (const item of clipboard.items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }

  if (!files.length && clipboard.files?.length) {
    files.push(...Array.from(clipboard.files).filter((file) => file.type.startsWith("image/")));
  }

  if (!files.length) return;

  event.preventDefault();
  uploadFiles(files);
}

function handleDragOver(event) {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.includes("Files")) event.preventDefault();
}

function handleDrop(event) {
  const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );

  if (!files.length) return;

  event.preventDefault();
  uploadFiles(files);
}

function removeImage(index) {
  localImages.value.splice(index, 1);
  mediaError.value = "";
}

function requestDelete() {
  if (props.isNew || props.saving) return;

  if (!deleteArmed.value) {
    deleteArmed.value = true;
    window.clearTimeout(deleteTimer);
    deleteTimer = window.setTimeout(() => {
      deleteArmed.value = false;
    }, 3200);
    return;
  }

  resetDeleteConfirmation();
  emit("delete");
}

function handleKeydown(event) {
  if (!props.open) return;

  if (event.key === "Escape") {
    event.preventDefault();
    if (deleteArmed.value) {
      resetDeleteConfirmation();
      return;
    }
    requestClose();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    submit(false);
  }
}

window.addEventListener("keydown", handleKeydown);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.clearTimeout(deleteTimer);
  window.clearTimeout(focusTimer);
});
</script>

<template>
  <section
    class="note-page"
    :class="{ 'is-open': open }"
    :aria-hidden="open ? 'false' : 'true'"
    role="dialog"
    aria-modal="true"
    aria-label="编辑我们的笔记"
    @paste="handlePaste"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <div class="note-page__atmosphere" aria-hidden="true">
      <div class="note-page__grain"></div>
      <div class="note-page__glow"></div>
    </div>

    <header class="note-page__topbar">
      <button class="note-page__back" type="button" @click="requestClose">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M15 10H5M9 6l-4 4 4 4" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        返回计划
      </button>

      <p class="note-page__section">
        <span aria-hidden="true">✦</span>
        {{ sectionTitle }}
      </p>

      <div class="note-page__actions">
        <button
          v-if="!isNew"
          class="note-page__delete"
          :class="{ 'is-armed': deleteArmed }"
          type="button"
          :disabled="saving"
          @click="requestDelete"
        >
          <svg v-if="!deleteArmed" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8M7 7v3M9 7v3" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ deleteArmed ? "再按一次确认" : "删除这一页" }}
        </button>

        <button class="note-page__save" type="button" :disabled="!canSave" @click="submit(false)">
          <span>{{ saving ? "保存中…" : "保存这一页" }}</span>
          <svg v-if="!saving" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 9.5 7.2 13 14 4.8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span v-else class="note-page__spinner" aria-hidden="true"></span>
        </button>
      </div>
    </header>

    <div class="note-page__paper">
      <div class="note-page__paper-head">
        <span class="note-page__eyebrow">A page for us · {{ sectionTitle }}</span>
        <span class="note-page__updated">{{ updatedLabel }}</span>
      </div>

      <textarea
        ref="titleInput"
        v-model="localTitle"
        class="note-page__title"
        rows="1"
        maxlength="200"
        placeholder="写下一个标题"
        aria-label="笔记标题"
        @input="resizeTitle"
        @keydown.enter.prevent="focusContent"
      ></textarea>

      <div class="note-page__divider" aria-hidden="true"><span>♡</span></div>

      <div class="note-page__media-toolbar">
        <button
          class="note-page__media-add"
          type="button"
          :disabled="saving || uploadingCount > 0 || localImages.length >= MAX_IMAGES"
          @click="openFilePicker"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="2.5" y="4" width="15" height="12" rx="2.5" stroke="currentColor" stroke-width="1.1"/>
            <circle cx="7" cy="8" r="1.4" stroke="currentColor" stroke-width="1"/>
            <path d="m4.5 14 3.8-4 2.7 2.6 2-1.8 3 3.2" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          插入照片
        </button>
        <span class="note-page__media-hint">也可以直接粘贴或拖入照片</span>
        <span class="note-page__media-count">{{ localImages.length }}/{{ MAX_IMAGES }}</span>
      </div>

      <input
        ref="fileInput"
        class="note-page__file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        @change="handleFileChange"
      />

      <p v-if="mediaError" class="note-page__media-error" role="alert" aria-live="polite">
        {{ mediaError }}
      </p>

      <textarea
        ref="contentInput"
        v-model="localContent"
        class="note-page__content"
        maxlength="50000"
        placeholder="把想说的话，慢慢写在这里……"
        aria-label="笔记正文"
        spellcheck="false"
      ></textarea>

      <div
        v-if="localImages.length || uploadingCount > 0"
        class="note-page__media-grid"
        aria-label="这一页插入的照片"
      >
        <figure
          v-for="(image, index) in localImages"
          :key="image.url"
          class="note-page__media-item"
        >
          <img :src="image.url" :alt="image.name || `照片 ${index + 1}`" loading="lazy" />
          <button
            class="note-page__media-remove"
            type="button"
            :aria-label="`移除照片 ${index + 1}`"
            title="移除这张照片"
            @click="removeImage(index)"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
        </figure>

        <div
          v-for="index in uploadingCount"
          :key="`uploading-${index}`"
          class="note-page__media-item is-uploading"
          aria-label="照片正在上传"
        >
          <span class="note-page__spinner" aria-hidden="true"></span>
          <small>放入中</small>
        </div>
      </div>

      <div class="note-page__paper-footer">
        <span>Only for us</span>
        <span aria-hidden="true">✦</span>
        <span>The Story of Us</span>
      </div>
    </div>

    <p class="note-page__hint">Ctrl / ⌘ + S 保存 · Esc 返回</p>
  </section>
</template>
