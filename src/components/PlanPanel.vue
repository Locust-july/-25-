<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import MeetingPlanCard from "./MeetingPlanCard.vue";

const props = defineProps({
  section: { type: Object, required: true },
  data: {
    type: Object,
    default: () => ({ plan: null, todos: [], notes: [] }),
  },
  plan: {
    type: Object,
    default: () => ({ date: "", time: "", place: "", note: "", updatedAt: null }),
  },
});

const emit = defineEmits([
  "add-todo",
  "toggle-todo",
  "delete-todo",
  "add-note",
  "open-note",
  "delete-note",
  "edit-plan",
]);

const addingTodo = ref(false);
const draftText = ref("");
const draftInput = ref(null);
const armedNoteId = ref(null);

let deleteTimer = null;

const todos = computed(() => props.data?.todos ?? []);
const notes = computed(() => props.data?.notes ?? []);
const isEmpty = computed(() => todos.value.length === 0 && notes.value.length === 0);

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function excerpt(content) {
  if (!content) return "";
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

function startAddTodo() {
  if (addingTodo.value) {
    draftInput.value?.focus();
    return;
  }

  addingTodo.value = true;
  draftText.value = "";

  nextTick(() => {
    draftInput.value?.focus();
  });
}

function cancelDraft() {
  addingTodo.value = false;
  draftText.value = "";
}

function submitDraft() {
  if (!addingTodo.value) return;

  const text = draftText.value.trim();

  if (!text) {
    cancelDraft();
    return;
  }

  emit("add-todo", { sectionId: props.section.id, text });
  cancelDraft();
}

function handleDraftBlur() {
  if (!addingTodo.value) return;
  submitDraft();
}

function requestDeleteNote(note) {
  if (armedNoteId.value === note.id) {
    armedNoteId.value = null;
    window.clearTimeout(deleteTimer);
    emit("delete-note", { sectionId: props.section.id, note });
    return;
  }

  armedNoteId.value = note.id;
  window.clearTimeout(deleteTimer);
  deleteTimer = window.setTimeout(() => {
    armedNoteId.value = null;
  }, 2600);
}

function openNote(note) {
  emit("open-note", { sectionId: props.section.id, note });
}

onBeforeUnmount(() => {
  window.clearTimeout(deleteTimer);
});
</script>

<template>
  <article class="plan-panel" :class="`plan-panel--${section.id}`">
    <div class="plan-panel__top">
      <div class="plan-panel__meta">
        <span class="plan-panel__no">{{ section.number }}</span>
        <span class="plan-panel__chapter">{{ section.chapter }}</span>
      </div>

      <span class="plan-panel__icon" aria-hidden="true">
        <svg v-if="section.id === 'meeting'" viewBox="0 0 32 32" fill="none">
          <rect x="5.5" y="7.5" width="21" height="19" rx="3" stroke="currentColor" stroke-width="1.1"/>
          <path d="M10 4.8v5M22 4.8v5M5.5 12.5h21" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M16 23s-4.6-2.7-4.6-5.6a2.7 2.7 0 0 1 4.6-2.1 2.7 2.7 0 0 1 4.6 2.1C20.6 20.3 16 23 16 23Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
        </svg>
        <svg v-else-if="section.id === 'travel'" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="11.3" stroke="currentColor" stroke-width="1.1"/>
          <path d="m21.6 10.4-3.1 7.7-7.7 3.1 3.1-7.7 7.7-3.1Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
          <circle cx="16" cy="16" r="1.2" fill="currentColor"/>
        </svg>
        <svg v-else viewBox="0 0 32 32" fill="none">
          <path d="M10 5v9M7 5v5a3 3 0 0 0 6 0V5M10 14v13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M22 5c-2.5 0-4 3.4-4 6.8 0 2.7 1.2 4.3 3 4.8V27M21 5v11.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M25.8 6.5 27 8.2l2 .5-1.4 1.6.2 2.1-1.9-.9-1.9.9.2-2.1-1.4-1.6 2-.5 1-1.7Z" fill="currentColor" fill-opacity=".6"/>
        </svg>
      </span>
    </div>

    <div class="plan-panel__heading">
      <h2>{{ section.title }}</h2>
      <p>{{ section.subtitle }}</p>
    </div>
    <div class="plan-panel__rule" aria-hidden="true"><span></span><i>✦</i><span></span></div>

    <div class="plan-panel__body">
      <MeetingPlanCard
        v-if="section.id === 'meeting'"
        :plan="plan"
        @edit="$emit('edit-plan')"
      />

      <div v-if="!isEmpty || addingTodo" class="panel-content">
        <ul v-if="todos.length || addingTodo" class="todo-list">
          <li v-if="addingTodo" class="todo-row todo-row--draft">
            <span class="todo-row__grip" aria-hidden="true">⋮</span>
            <span class="todo-checkbox todo-checkbox--draft" aria-hidden="true"></span>
            <input
              ref="draftInput"
              v-model="draftText"
              type="text"
              maxlength="300"
              placeholder="待办事项"
              aria-label="新的待办事项"
              @keydown.enter.prevent="submitDraft"
              @keydown.esc.prevent="cancelDraft"
              @blur="handleDraftBlur"
            />
            <button
              class="todo-row__commit"
              type="button"
              aria-label="添加这条待办"
              title="添加"
              @mousedown.prevent
              @click="submitDraft"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </li>

          <li
            v-for="todo in todos"
            :key="todo.id"
            class="todo-row"
            :class="{ 'is-done': todo.done }"
          >
            <span class="todo-row__grip" aria-hidden="true">⋮</span>
            <input
              class="todo-checkbox"
              type="checkbox"
              :checked="todo.done"
              :aria-label="`${todo.done ? '标记为未完成' : '标记为完成'}：${todo.text}`"
              @change="$emit('toggle-todo', { sectionId: section.id, todo })"
            />
            <span class="todo-row__text">{{ todo.text }}</span>
            <button
              class="todo-row__delete"
              type="button"
              :aria-label="`删除待办：${todo.text}`"
              title="删除待办"
              @click="$emit('delete-todo', { sectionId: section.id, todo })"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8M7 7v3M9 7v3" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </li>
        </ul>

        <p v-if="addingTodo" class="todo-draft-hint">按 Enter 添加 · Esc 取消 · 点空白处也会保存</p>

        <div v-if="notes.length" class="notes-list">
          <article v-for="(note, index) in notes" :key="note.id" class="note-card">
            <button class="note-card__body" type="button" @click="openNote(note)">
              <span class="note-card__top">
                <span class="note-card__kicker">Our note · {{ formatDate(note.updatedAt) }}</span>
                <span class="note-card__index">{{ pad(index + 1) }}</span>
              </span>
              <span class="note-card__title">{{ note.title || "未命名的一页" }}</span>
              <span class="note-card__excerpt">
                {{
                  excerpt(note.content) ||
                  (note.images?.length
                    ? `收录了 ${note.images.length} 张照片`
                    : "这一页还没有正文，点开写点什么吧。")
                }}
              </span>

              <span v-if="note.images?.length" class="note-card__media">
                <img
                  v-for="(image, imageIndex) in note.images.slice(0, 3)"
                  :key="image.url"
                  :src="image.url"
                  :alt="image.name || `照片 ${imageIndex + 1}`"
                  loading="lazy"
                />
                <span v-if="note.images.length > 3" class="note-card__media-more">
                  +{{ note.images.length - 3 }}
                </span>
              </span>

              <span class="note-card__footer">
                <span>{{ note.content?.trim() ? `${note.content.trim().length} 字` : "空白页" }}</span>
                <span>打开这一页 <i>→</i></span>
              </span>
            </button>

            <button
              class="note-card__delete"
              :class="{ 'is-armed': armedNoteId === note.id }"
              type="button"
              :aria-label="armedNoteId === note.id ? '再次点击确认删除这一页' : '删除这一页笔记'"
              :title="armedNoteId === note.id ? '再次点击确认删除' : '删除笔记'"
              @click.stop="requestDeleteNote(note)"
            >
              <svg v-if="armedNoteId !== note.id" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8M7 7v3M9 7v3" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span v-else>确认删除？</span>
            </button>
          </article>
        </div>
      </div>

      <div v-if="isEmpty && !addingTodo && section.id !== 'meeting'" class="empty-state">
        <span class="empty-state__icon" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none">
            <rect x="8" y="7" width="24" height="26" rx="3" stroke="currentColor" stroke-width="1.1"/>
            <path d="M14 14h12M14 19h12M14 24h7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>
            <path d="M27.5 27.5h7M31 24v7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          </svg>
        </span>
        <p class="empty-state__title">{{ section.emptyTitle }}</p>
        <p class="empty-state__text">{{ section.emptyText }}</p>
        <span class="empty-state__hint">用下方按钮开始</span>
      </div>

      <div v-if="isEmpty && !addingTodo && section.id === 'meeting'" class="meeting-empty-hint">
        <span aria-hidden="true">✦</span>
        还没有待办和笔记，把想一起做的事放进下面的按钮里。
      </div>
    </div>

    <footer class="plan-panel__footer">
      <span class="plan-panel__footer-caption">{{ section.footer }}</span>
      <div class="panel-actions">
        <button
          class="panel-action panel-action--todo"
          type="button"
          :disabled="addingTodo"
          @click="startAddTodo"
        >
          <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="2.2" y="2.4" width="9.2" height="9.2" rx="2" stroke="currentColor" stroke-width="1.05"/>
            <path d="m4.6 7 1.7 1.8 3.2-3.7" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 5.2v10.3H3.7M14 5.2h2.1v7.6" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" opacity=".6"/>
          </svg>
          待办
        </button>
        <button class="panel-action panel-action--note" type="button" @click="$emit('add-note', section.id)">
          <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 2.5h7.6L15 5.9v9.6H4z" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>
            <path d="M11.4 2.7v3.4h3.4M6.5 9h6M6.5 12h4" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"/>
          </svg>
          笔记
        </button>
      </div>
    </footer>
  </article>
</template>
