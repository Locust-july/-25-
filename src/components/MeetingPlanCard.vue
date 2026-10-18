<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  plan: {
    type: Object,
    default: () => ({ date: "", time: "", place: "", note: "", updatedAt: null }),
  },
});

const emit = defineEmits(["edit"]);

const now = ref(Date.now());
let ticker = null;

onMounted(() => {
  ticker = window.setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});

onBeforeUnmount(() => {
  window.clearInterval(ticker);
});

const targetDate = computed(() => {
  if (!props.plan?.date) return null;
  const [year, month, day] = props.plan.date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
});

const hasPlan = computed(() => Boolean(targetDate.value));

const daysUntil = computed(() => {
  if (!targetDate.value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((targetDate.value.getTime() - today.getTime()) / 86_400_000);
});

const countdownLabel = computed(() => {
  if (daysUntil.value === null) return "";
  if (daysUntil.value === 0) return "就是今天";
  if (daysUntil.value > 0) return "距离下一次见面";
  return "见面日已经变成回忆";
});

const countdownValue = computed(() => {
  if (daysUntil.value === null) return "";
  if (daysUntil.value === 0) return "♡";
  if (daysUntil.value > 0) return String(daysUntil.value);
  return "♡";
});

const countdownUnit = computed(() => {
  if (daysUntil.value === null) return "";
  if (daysUntil.value === 0) return "见面日";
  if (daysUntil.value > 0) return daysUntil.value === 1 ? "天 · 明天见" : "天";
  return "想你了";
});

const formattedDate = computed(() => {
  if (!targetDate.value) return "";

  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${targetDate.value.getFullYear()}年${
    targetDate.value.getMonth() + 1
  }月${targetDate.value.getDate()}日 · ${weekdays[targetDate.value.getDay()]}`;
});

const timeText = computed(() => props.plan?.time || "时间待定");
const placeText = computed(() => props.plan?.place || "地点待定");
</script>

<template>
  <div class="meeting-plan" :class="{ 'is-set': hasPlan }">
    <div class="meeting-plan__head">
      <span class="meeting-plan__eyebrow">
        <span aria-hidden="true">✦</span>
        Our next meeting
      </span>
      <button
        v-if="hasPlan"
        class="meeting-plan__edit"
        type="button"
        @click="$emit('edit')"
      >
        编辑计划
      </button>
    </div>

    <template v-if="hasPlan">
      <div class="meeting-plan__content">
        <div class="meeting-plan__countdown">
          <span class="meeting-plan__countdown-label">{{ countdownLabel }}</span>
          <div class="meeting-plan__countdown-value">
            <strong>{{ countdownValue }}</strong>
            <span>{{ countdownUnit }}</span>
          </div>
        </div>

        <div class="meeting-plan__details">
          <p class="meeting-plan__date">{{ formattedDate }}</p>
          <p class="meeting-plan__meta">
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M9 16s5.5-4.2 5.5-8.3A5.5 5.5 0 0 0 9 2.2a5.5 5.5 0 0 0-5.5 5.5C3.5 11.8 9 16 9 16Z" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>
              <circle cx="9" cy="7.5" r="1.6" stroke="currentColor" stroke-width="1"/>
            </svg>
            <span>{{ placeText }}</span>
          </p>
          <p class="meeting-plan__meta">
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.6" stroke="currentColor" stroke-width="1.05"/>
              <path d="M9 5.4V9l2.6 1.5" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>{{ timeText }}</span>
          </p>
          <p v-if="plan.note" class="meeting-plan__note">“{{ plan.note }}”</p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="meeting-plan__empty">
        <span class="meeting-plan__ghost" aria-hidden="true">待定</span>
        <div class="meeting-plan__empty-copy">
          <p>把下一次见面，<br>写成确定的日子。</p>
          <button class="meeting-plan__empty-button" type="button" @click="$emit('edit')">
            记下这一天
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
