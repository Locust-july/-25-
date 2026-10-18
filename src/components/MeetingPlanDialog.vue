<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  plan: {
    type: Object,
    default: () => ({ date: "", time: "", place: "", note: "" }),
  },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(["save", "clear", "close"]);

const modalElement = ref(null);
const dateInput = ref(null);
const date = ref("");
const time = ref("");
const place = ref("");
const note = ref("");
const localError = ref("");
const clearArmed = ref(false);

let focusTimer = null;
let clearTimer = null;
let previousFocus = null;

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

const hasExistingPlan = computed(() => Boolean(props.plan?.date));
const canSave = computed(() => Boolean(date.value) && !props.saving);

watch(
  () => props.open,
  async (open) => {
    window.clearTimeout(focusTimer);

    if (!open) {
      clearArmed.value = false;
      window.clearTimeout(clearTimer);
      document.body.classList.remove("is-plan-open");

      await nextTick();
      window.setTimeout(() => {
        if (previousFocus?.isConnected) {
          previousFocus.focus({ preventScroll: true });
        } else {
          document.querySelector(".meeting-plan button")?.focus({ preventScroll: true });
        }
      }, reducedMotion?.matches ? 20 : 260);
      return;
    }

    previousFocus = document.activeElement;
    date.value = props.plan?.date ?? "";
    time.value = props.plan?.time ?? "";
    place.value = props.plan?.place ?? "";
    note.value = props.plan?.note ?? "";
    localError.value = "";
    clearArmed.value = false;
    document.body.classList.add("is-plan-open");

    await nextTick();
    focusTimer = window.setTimeout(() => {
      dateInput.value?.focus({ preventScroll: true });
    }, reducedMotion?.matches ? 20 : 330);
  },
);

function submit() {
  if (props.saving) return;

  if (!date.value) {
    localError.value = "先选好一个见面的日期吧。";
    dateInput.value?.focus({ preventScroll: true });
    return;
  }

  localError.value = "";
  emit("save", {
    date: date.value,
    time: time.value,
    place: place.value,
    note: note.value,
  });
}

function requestClose() {
  if (props.saving) return;
  emit("close");
}

function requestClear() {
  if (props.saving || !hasExistingPlan.value) return;

  if (!clearArmed.value) {
    clearArmed.value = true;
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => {
      clearArmed.value = false;
    }, 3200);
    return;
  }

  clearArmed.value = false;
  emit("clear");
}

function handleKeydown(event) {
  if (!props.open) return;

  if (event.key === "Escape") {
    event.preventDefault();
    if (clearArmed.value) {
      clearArmed.value = false;
      return;
    }
    requestClose();
    return;
  }

  if (event.key !== "Tab" || !modalElement.value) return;

  const focusable = Array.from(
    modalElement.value.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  window.clearTimeout(focusTimer);
  window.clearTimeout(clearTimer);
  document.body.classList.remove("is-plan-open");
});
</script>

<template>
  <div
    ref="modalElement"
    class="plan-modal"
    :class="{ 'is-open': open }"
    :aria-hidden="open ? 'false' : 'true'"
  >
    <div class="plan-modal__scrim" @click="requestClose"></div>

    <section
      class="plan-modal__card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planDialogTitle"
      aria-describedby="planDialogDescription"
    >
      <button
        class="plan-modal__close"
        type="button"
        aria-label="关闭见面计划"
        :disabled="saving"
        @click="requestClose"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
        </svg>
      </button>

      <div class="plan-modal__crest" aria-hidden="true">
        <svg viewBox="0 0 34 34" fill="none">
          <rect x="5.5" y="7.5" width="23" height="21" rx="3.5" stroke="currentColor" stroke-width="1.1"/>
          <path d="M10.5 4.5v5M23.5 4.5v5M5.5 13.5h23" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M17 25s-5.2-3-5.2-6.3a3 3 0 0 1 5.2-2.4 3 3 0 0 1 5.2 2.4C22.2 22 17 25 17 25Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
        </svg>
      </div>

      <p class="plan-modal__eyebrow">The next hello</p>
      <h2 id="planDialogTitle">把下一次见面，<br><em>写进日子里。</em></h2>
      <p class="plan-modal__desc" id="planDialogDescription">选好日期和地点，<br>从今天起，等待也会变得具体。</p>

      <form class="plan-form" novalidate @submit.prevent="submit">
        <div class="plan-form__row">
          <label class="plan-field">
            <span>见面的日期 <i>*</i></span>
            <input ref="dateInput" v-model="date" type="date" aria-required="true" />
          </label>
          <label class="plan-field">
            <span>大概几点</span>
            <input v-model="time" type="time" />
          </label>
        </div>

        <label class="plan-field">
          <span>在哪里见</span>
          <input v-model="place" type="text" maxlength="120" placeholder="老地方，或一个想去的新地方" />
        </label>

        <label class="plan-field">
          <span>想提前说的话</span>
          <textarea
            v-model="note"
            maxlength="1000"
            rows="3"
            placeholder="比如：见面第一件事，是先抱很久很久。"
          ></textarea>
        </label>

        <p class="plan-form__error" :class="{ 'is-visible': localError }" role="alert" aria-live="polite">
          {{ localError }}
        </p>

        <button class="plan-form__submit" type="submit" :disabled="!canSave">
          <span>{{ saving ? "正在收好这份期待…" : "收好这个期待" }}</span>
          <svg v-if="!saving" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 10h11M11.5 6.5 15 10l-3.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span v-else class="plan-form__spinner" aria-hidden="true"></span>
        </button>

        <div class="plan-form__footer">
          <button
            v-if="hasExistingPlan"
            class="plan-form__clear"
            :class="{ 'is-armed': clearArmed }"
            type="button"
            :disabled="saving"
            @click="requestClear"
          >
            {{ clearArmed ? "再点一次，清空计划" : "清空这次计划" }}
          </button>
          <span v-else class="plan-form__hint">只写给我们两个人的未来</span>
          <span class="plan-form__required"><i>*</i> 日期必须填写</span>
        </div>
      </form>
    </section>
  </div>
</template>
