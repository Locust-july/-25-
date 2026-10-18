<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  success: { type: Boolean, default: false },
  error: { type: String, default: "" },
});

const emit = defineEmits(["submit", "close", "forgot", "clear-error"]);

const modalElement = ref(null);
const cardElement = ref(null);
const inputElement = ref(null);
const passcode = ref("");
const showPassword = ref(false);
const localError = ref("");
const shaking = ref(false);
const reducedMotion =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

let shakeTimer = null;
let focusTimer = null;

const displayError = computed(() => props.error || localError.value);
const inputType = computed(() => (showPassword.value ? "text" : "password"));
const isBusy = computed(() => props.loading || props.success);
const submitLabel = computed(() => {
  if (props.success) return "暗号正确，门开了";
  if (props.loading) return "正在为你开门…";
  return "打开我们的故事";
});
const hintText = computed(() => {
  if (props.success) return "暗号正确，只为你开门";
  return "提示 · 一个被我们记住的日子";
});

function triggerShake() {
  if (reducedMotion?.matches) return;

  shaking.value = false;
  window.clearTimeout(shakeTimer);
  window.requestAnimationFrame(() => {
    shaking.value = true;
    shakeTimer = window.setTimeout(() => {
      shaking.value = false;
    }, 460);
  });
}

watch(
  () => displayError.value,
  (message) => {
    if (message) triggerShake();
  },
);

watch(
  () => props.open,
  async (open) => {
    document.body.classList.toggle("is-modal-open", open);

    if (open) {
      passcode.value = "";
      showPassword.value = false;
      localError.value = "";
      window.clearTimeout(focusTimer);
      await nextTick();
      focusTimer = window.setTimeout(() => {
        inputElement.value?.focus({ preventScroll: true });
      }, reducedMotion?.matches ? 20 : 420);
    } else {
      window.clearTimeout(focusTimer);
    }
  },
);

function clearErrors() {
  localError.value = "";
  emit("clear-error");
}

function handleSubmit() {
  if (isBusy.value) return;

  const code = passcode.value.trim();

  if (!code) {
    localError.value = "先输入我们的专属暗号，再开门哦。";
    inputElement.value?.focus();
    return;
  }

  localError.value = "";
  emit("submit", code);
}

function requestClose() {
  if (props.loading || props.success) return;
  emit("close");
}

function togglePassword() {
  if (isBusy.value) return;
  showPassword.value = !showPassword.value;
  nextTick(() => {
    inputElement.value?.focus({ preventScroll: true });
    const end = passcode.value.length;
    try {
      inputElement.value?.setSelectionRange(end, end);
    } catch {
      // Some mobile webviews do not expose selection APIs.
    }
  });
}

function handleKeydown(event) {
  if (!props.open) return;

  if (event.key === "Escape") {
    event.preventDefault();
    requestClose();
    return;
  }

  if (event.key !== "Tab" || !modalElement.value) return;

  const focusable = Array.from(
    modalElement.value.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);

  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

window.addEventListener("keydown", handleKeydown);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  document.body.classList.remove("is-modal-open");
  window.clearTimeout(shakeTimer);
  window.clearTimeout(focusTimer);
});
</script>

<template>
  <div
    id="loginModal"
    ref="modalElement"
    class="modal"
    :class="{ 'is-open': open }"
    :aria-hidden="open ? 'false' : 'true'"
  >
    <div class="modal__scrim" @click="requestClose"></div>

    <section
      ref="cardElement"
      class="modal__card"
      :class="{ 'is-shaking': shaking }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loginTitle"
      aria-describedby="loginDescription"
    >
      <button
        class="modal__close"
        type="button"
        aria-label="关闭登录窗口"
        :disabled="loading || success"
        @click="requestClose"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
        </svg>
      </button>

      <div class="modal__crest" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none">
          <path d="M12.5 16v-4a5.5 5.5 0 0 1 11 0v4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
          <rect x="9.5" y="15.5" width="17" height="13.5" rx="4" stroke="currentColor" stroke-width="1.25"/>
          <circle cx="18" cy="21" r="1.7" fill="currentColor"/>
          <path d="M17.2 22.4h1.6l.7 4h-3z" fill="currentColor"/>
        </svg>
      </div>

      <p class="modal__eyebrow">The private door</p>
      <h2 id="loginTitle">初见乍欢，<br><em>久处亦怦然。</em></h2>
      <p class="modal__desc" id="loginDescription">输入我们的专属暗号，<br>打开藏在时光里的悄悄话。</p>

      <form class="login-form" novalidate @submit.prevent="handleSubmit">
        <div class="field-heading">
          <label for="passcode">专属暗号</label>
          <span>仅你知晓</span>
        </div>

        <div class="input-shell" :class="{ 'is-invalid': displayError }">
          <span class="input-shell__icon" aria-hidden="true">
            <svg viewBox="0 0 22 22" fill="none">
              <circle cx="8.4" cy="8.1" r="3.6" stroke="currentColor" stroke-width="1.1"/>
              <path d="M11.2 10.8l6.3 6.3M14.8 14.4l1.8-1.8M16.6 16.2l1.7-1.7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            </svg>
          </span>
          <input
            id="passcode"
            ref="inputElement"
            v-model="passcode"
            name="passcode"
            :type="inputType"
            inputmode="text"
            autocomplete="current-password"
            placeholder="输入我们的暗号"
            maxlength="24"
            :disabled="isBusy"
            :aria-invalid="Boolean(displayError)"
            aria-describedby="loginHint loginError"
            @input="clearErrors"
          />
          <button
            class="eye-toggle"
            type="button"
            :aria-label="showPassword ? '隐藏暗号' : '显示暗号'"
            :aria-pressed="showPassword"
            :disabled="isBusy"
            @click="togglePassword"
          >
            <svg class="eye-toggle__open" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2.8 12S6.2 6.5 12 6.5 21.2 12 21.2 12 17.8 17.5 12 17.5 2.8 12 2.8 12Z" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.15"/>
            </svg>
            <svg class="eye-toggle__closed" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 4l16 16M9.2 6.9A9.8 9.8 0 0 1 12 6.5c5.8 0 9.2 5.5 9.2 5.5a17 17 0 0 1-3 3.6M6.2 8.3A17.8 17.8 0 0 0 2.8 12S6.2 17.5 12 17.5c1.2 0 2.2-.2 3.2-.6" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="form-meta">
          <p class="form-hint" :class="{ 'is-highlighted': success || displayError }">
            <span aria-hidden="true">✧</span>
            <span>{{ hintText }}</span>
          </p>
          <button class="forgot-button" type="button" :disabled="isBusy" @click="$emit('forgot')">
            忘记暗号？
          </button>
        </div>

        <p id="loginError" class="form-error" :class="{ 'is-visible': displayError }" role="alert" aria-live="polite">
          {{ displayError }}
        </p>

        <button
          class="submit-button"
          :class="{ 'is-busy': loading, 'is-success': success }"
          type="submit"
          :disabled="isBusy"
        >
          <span class="submit-button__label">{{ submitLabel }}</span>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12h15M14 7l5 5-5 5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </form>

      <div class="modal__footer">
        <span aria-hidden="true"></span>
        <p>Only the two of us</p>
        <span aria-hidden="true"></span>
      </div>
    </section>
  </div>
</template>
