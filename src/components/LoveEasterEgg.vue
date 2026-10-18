<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const emit = defineEmits(["finished"]);

const hearts = ref([]);
const messageVisible = ref(true);

let messageTimer = null;
let finishTimer = null;
let nextId = 0;

const tones = ["rose", "gold", "blush", "cream"];
const glyphs = ["♥", "♡", "❥"];

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function buildHearts() {
  const nextHearts = [];

  for (let index = 0; index < 88; index += 1) {
    const duration = randomBetween(2.8, 3.8);
    const delay = randomBetween(-2.1, 1.7);

    nextHearts.push({
      id: `love-${nextId++}`,
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      tone: tones[Math.floor(Math.random() * tones.length)],
      style: {
        left: `${randomBetween(2, 98)}%`,
        "--heart-size": `${randomBetween(13, 34).toFixed(1)}px`,
        "--fall-duration": `${duration.toFixed(2)}s`,
        "--fall-delay": `${delay.toFixed(2)}s`,
        "--drift": `${randomBetween(-90, 90).toFixed(1)}px`,
        "--spin": `${randomBetween(-190, 190).toFixed(0)}deg`,
        "--heart-opacity": randomBetween(0.45, 0.95).toFixed(2),
      },
    });
  }

  return nextHearts;
}

onMounted(() => {
  hearts.value = buildHearts();

  messageTimer = window.setTimeout(() => {
    messageVisible.value = false;
  }, 2200);

  finishTimer = window.setTimeout(() => {
    emit("finished");
  }, 5000);
});

onBeforeUnmount(() => {
  window.clearTimeout(messageTimer);
  window.clearTimeout(finishTimer);
});
</script>

<template>
  <div class="love-easter-egg">
    <span
      v-for="heart in hearts"
      :key="heart.id"
      class="love-easter-egg__heart"
      :class="`is-${heart.tone}`"
      :style="heart.style"
      aria-hidden="true"
    >
      {{ heart.glyph }}
    </span>

    <Transition name="love-message">
      <div
        v-if="messageVisible"
        class="love-easter-egg__message"
        role="status"
        aria-live="polite"
      >
        <span class="love-easter-egg__eyebrow">
          <i aria-hidden="true"></i>
          Always &amp; always
          <i aria-hidden="true"></i>
        </span>
        <strong>你是爱的中心</strong>
        <span class="love-easter-egg__sub">给最喜欢的你 ♡</span>
      </div>
    </Transition>
  </div>
</template>
