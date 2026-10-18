<script setup>
import { nextTick, ref, watch } from "vue";
import { sections } from "../data/sections";
import PlanPanel from "./PlanPanel.vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  board: {
    type: Object,
    default: () => ({
      meeting: {
        plan: { date: "", time: "", place: "", note: "", updatedAt: null },
        todos: [],
        notes: [],
      },
      travel: { todos: [], notes: [] },
      wish: { todos: [], notes: [] },
    }),
  },
});

defineEmits([
  "relock",
  "add-todo",
  "toggle-todo",
  "delete-todo",
  "add-note",
  "open-note",
  "delete-note",
  "edit-plan",
  "love-egg",
  "open-memory-wall",
]);

const dashboardElement = ref(null);

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    await nextTick();
    dashboardElement.value?.focus({ preventScroll: true });
  },
);
</script>

<template>
  <section
    id="dashboard"
    ref="dashboardElement"
    class="dashboard"
    :class="{ 'is-visible': visible }"
    :aria-hidden="visible ? 'false' : 'true'"
    aria-labelledby="dashboardTitle"
    tabindex="-1"
  >
    <div class="dashboard__atmosphere" aria-hidden="true">
      <div class="dashboard__halo"></div>
      <div class="dashboard__glow dashboard__glow--rose"></div>
      <div class="dashboard__glow dashboard__glow--gold"></div>
      <div class="dashboard__grain"></div>
      <div class="dashboard__petals"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>

    <header class="dashboard__topbar">
      <div class="brand" aria-label="The Story of Us，我们的恋爱手记">
        <button
          class="brand__seal brand__seal--heart"
          type="button"
          aria-label="点一下爱心，收下一份小惊喜"
          title="一个藏起来的小彩蛋"
          @click="$emit('love-egg')"
        >
          <svg viewBox="0 0 34 34" fill="none" aria-hidden="true">
            <path d="M17 26.2s-8.3-4.8-8.3-10.2A4.9 4.9 0 0 1 17 12.2a4.9 4.9 0 0 1 8.3 3.8c0 5.4-8.3 10.2-8.3 10.2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
            <path d="M17 6.2v2.1M8.4 9.7l1.5 1.5M25.6 9.7l-1.5 1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".65"/>
          </svg>
        </button>
        <span class="brand__text">
          <strong>The Story of Us</strong>
          <small>我们的恋爱手记</small>
        </span>
      </div>

      <div class="dashboard__actions">
        <p class="dashboard__privacy">
          <span class="dashboard__privacy-dot" aria-hidden="true"></span>
          The private room <i>·</i> 仅限两人
        </p>
        <button class="dashboard__relock" type="button" @click="$emit('relock')">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M6.4 9V6.8a3.6 3.6 0 0 1 7.2 0V9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            <rect x="4.4" y="8.8" width="11.2" height="8.7" rx="2.4" stroke="currentColor" stroke-width="1.1"/>
          </svg>
          重新上锁
        </button>
      </div>
    </header>

    <main class="dashboard__main">
      <section class="dashboard__intro" aria-labelledby="dashboardTitle">
        <div class="dashboard__intro-copy">
          <p class="dashboard__eyebrow">
            <span aria-hidden="true"></span>
            Welcome back, my love
          </p>
          <h1 id="dashboardTitle">初见乍欢，<br><em>久处亦怦然。</em></h1>
          <p class="dashboard__sub">下一次见面、下一段旅程、下一口心动，<br>都想和你一起完成。</p>
        </div>

        <button
          class="dashboard__seal dashboard__seal--button"
          type="button"
          aria-label="打开我们的纪念照片墙"
          title="打开我们的纪念照片墙"
          @click="$emit('open-memory-wall')"
        >
          <span class="dashboard__seal-star" aria-hidden="true">✦</span>
          <span class="dashboard__seal-heart" aria-hidden="true">♡</span>
          <strong>U &amp; I</strong>
          <small>Always, always</small>
        </button>
      </section>

      <div class="plan-grid">
        <PlanPanel
          v-for="section in sections"
          :key="section.id"
          :section="section"
          :data="board[section.id]"
          :plan="board[section.id]?.plan"
          @add-todo="$emit('add-todo', $event)"
          @toggle-todo="$emit('toggle-todo', $event)"
          @delete-todo="$emit('delete-todo', $event)"
          @add-note="$emit('add-note', $event)"
          @open-note="$emit('open-note', $event)"
          @delete-note="$emit('delete-note', $event)"
          @edit-plan="$emit('edit-plan')"
        />
      </div>

      <p class="dashboard__footer">初见乍欢，久处亦怦然 · Made with love, only for us.</p>
    </main>
  </section>
</template>
