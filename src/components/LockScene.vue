<script setup>
import { onMounted, ref } from "vue";

const props = defineProps({
  unlocking: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["open", "love-egg"]);

const fireflies = ref(null);
const reducedMotion =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function createFireflies() {
  if (!fireflies.value || reducedMotion?.matches) return;

  const amount = window.innerWidth < 700 ? 14 : 26;
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < amount; index += 1) {
    const firefly = document.createElement("span");
    firefly.className = "firefly";
    firefly.style.left = `${randomBetween(3, 97)}%`;
    firefly.style.top = `${randomBetween(8, 92)}%`;
    firefly.style.setProperty("--size", `${randomBetween(1.5, 3.4).toFixed(2)}px`);
    firefly.style.setProperty("--duration", `${randomBetween(9, 21).toFixed(2)}s`);
    firefly.style.setProperty("--delay", `${randomBetween(-20, 0).toFixed(2)}s`);
    firefly.style.setProperty("--opacity", randomBetween(0.25, 0.68).toFixed(2));
    firefly.style.setProperty("--drift-x", `${randomBetween(-34, 42).toFixed(1)}px`);
    firefly.style.setProperty("--drift-y", `${randomBetween(-105, -38).toFixed(1)}px`);
    fragment.append(firefly);
  }

  fireflies.value.append(fragment);
}

function spawnHeartBurst(clientX, clientY) {
  if (reducedMotion?.matches) return;

  const glyphs = ["♡", "✦", "♥", "·"];
  const amount = 9;

  for (let index = 0; index < amount; index += 1) {
    const particle = document.createElement("span");
    const angle = (Math.PI * 2 * index) / amount + randomBetween(-0.34, 0.34);
    const distance = randomBetween(35, 85);

    particle.className = "heart-pop";
    particle.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    particle.style.left = `${clientX}px`;
    particle.style.top = `${clientY}px`;
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance - randomBetween(18, 42)}px`);
    particle.style.setProperty("--scale", randomBetween(0.65, 1.25).toFixed(2));
    particle.style.setProperty("--rot", `${randomBetween(-70, 70).toFixed(0)}deg`);
    particle.style.setProperty("--heart-size", `${randomBetween(8, 16).toFixed(1)}px`);

    document.body.append(particle);
    window.setTimeout(() => particle.remove(), 1200);
  }
}

function handleLockClick(event) {
  if (props.unlocking) return;

  const trigger = event.currentTarget;
  const rect = trigger?.getBoundingClientRect();
  const clickX = event.clientX || (rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
  const clickY = event.clientY || (rect ? rect.top + rect.height / 2 : window.innerHeight / 2);

  spawnHeartBurst(clickX, clickY);
  emit("open");
}

onMounted(() => {
  createFireflies();
});
</script>

<template>
  <div class="page">
    <div class="atmosphere" aria-hidden="true">
      <div class="atmosphere__moon"></div>
      <div class="atmosphere__glow atmosphere__glow--rose"></div>
      <div class="atmosphere__glow atmosphere__glow--amber"></div>
      <div class="atmosphere__grain"></div>
      <div class="atmosphere__vignette"></div>
      <div ref="fireflies" class="fireflies"></div>
    </div>

    <header class="topbar">
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

      <p class="privacy-note">
        <span class="privacy-note__dot" aria-hidden="true"></span>
        Private <i>·</i> 仅限两人
      </p>
    </header>

    <main class="hero">
      <div class="hero__intro">
        <p class="eyebrow">
          <span class="eyebrow__line" aria-hidden="true"></span>
          A little universe, just for us
          <span class="eyebrow__line" aria-hidden="true"></span>
        </p>
        <h1>
          <span>把我们的故事</span>
          <span class="hero__accent">锁在这里<em>。</em></span>
        </h1>
        <p class="hero__sub">一扇门，一个暗号，和只属于两个人的春夏秋冬。</p>
      </div>

      <div class="lock-stage">
        <div class="lock-stage__orbit lock-stage__orbit--outer" aria-hidden="true"><i></i></div>
        <div class="lock-stage__orbit lock-stage__orbit--inner" aria-hidden="true"><i></i></div>

        <button
          class="lock"
          :class="{ 'is-unlocking': unlocking }"
          id="lockTrigger"
          type="button"
          aria-label="轻触锁扣，打开我们的登录页面"
          aria-haspopup="dialog"
          aria-controls="loginModal"
          @click="handleLockClick"
        >
          <span class="lock__aura" aria-hidden="true"></span>
          <svg class="lock__svg" viewBox="0 0 280 330" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="shackleMetal" x1="72" y1="45" x2="210" y2="154" gradientUnits="userSpaceOnUse">
                <stop stop-color="#fae9c7"/>
                <stop offset=".24" stop-color="#d9b37a"/>
                <stop offset=".48" stop-color="#9a6c3d"/>
                <stop offset=".7" stop-color="#d8ae74"/>
                <stop offset="1" stop-color="#a67745"/>
              </linearGradient>
              <linearGradient id="bodyMetal" x1="57" y1="149" x2="224" y2="296" gradientUnits="userSpaceOnUse">
                <stop stop-color="#f1d6a7"/>
                <stop offset=".2" stop-color="#d2a66d"/>
                <stop offset=".47" stop-color="#b3844e"/>
                <stop offset=".72" stop-color="#e0bd8b"/>
                <stop offset="1" stop-color="#996b3e"/>
              </linearGradient>
              <linearGradient id="innerMetal" x1="78" y1="157" x2="202" y2="280" gradientUnits="userSpaceOnUse">
                <stop stop-color="#f8e6c7" stop-opacity=".48"/>
                <stop offset=".48" stop-color="#8d5f35" stop-opacity=".18"/>
                <stop offset="1" stop-color="#fff0d5" stop-opacity=".13"/>
              </linearGradient>
              <radialGradient id="keyholeDepth" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(134 191) rotate(69) scale(47)">
                <stop stop-color="#5b3942"/>
                <stop offset=".56" stop-color="#2b1921"/>
                <stop offset="1" stop-color="#160d13"/>
              </radialGradient>
              <filter id="bodyShadow" x="16" y="116" width="248" height="210" filterUnits="userSpaceOnUse">
                <feDropShadow dx="0" dy="20" stdDeviation="16" flood-color="#08040b" flood-opacity=".62"/>
              </filter>
              <filter id="softBlur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="7"/>
              </filter>
            </defs>

            <ellipse cx="140" cy="309" rx="76" ry="11" fill="#09050c" opacity=".55" filter="url(#softBlur)"/>

            <g class="lock__shackle-group">
              <path d="M82 151V105C82 68 108 43 140 43C172 43 198 68 198 105V151" stroke="url(#shackleMetal)" stroke-width="25" stroke-linecap="round"/>
              <path d="M84 148V105C84 70 109 47 140 47" stroke="#fff2d9" stroke-opacity=".34" stroke-width="3.2" stroke-linecap="round"/>
              <path d="M195 148V105C195 83 183 64 164 54" stroke="#5d3c23" stroke-opacity=".45" stroke-width="2.2" stroke-linecap="round"/>
              <path d="M97 148V105C97 82 112 62 135 55" stroke="#fff4de" stroke-opacity=".2" stroke-width="1.2" stroke-linecap="round"/>
            </g>

            <g class="lock__body-group" filter="url(#bodyShadow)">
              <rect x="42" y="142" width="196" height="156" rx="34" fill="url(#bodyMetal)"/>
              <rect x="49.5" y="149.5" width="181" height="141" rx="27.5" stroke="#5f3d23" stroke-opacity=".52" stroke-width="1.3"/>
              <rect x="57" y="157" width="166" height="126" rx="21" fill="url(#innerMetal)"/>
              <path d="M65 170C65 160 73 152 83 152H197C207 152 215 160 215 170" stroke="#fff0d2" stroke-opacity=".34" stroke-width="1.1"/>
              <path d="M58 272C70 283 84 288 100 288H180C196 288 210 283 222 272" stroke="#674428" stroke-opacity=".24" stroke-width="1"/>

              <g fill="#76502e">
                <circle cx="68" cy="166" r="2.6" opacity=".7"/>
                <circle cx="212" cy="166" r="2.6" opacity=".7"/>
                <circle cx="68" cy="276" r="2.6" opacity=".55"/>
                <circle cx="212" cy="276" r="2.6" opacity=".55"/>
              </g>

              <circle cx="140" cy="196" r="34" stroke="#6f4827" stroke-opacity=".26" stroke-width="1"/>
              <circle class="lock__keyhole-ripple" cx="140" cy="196" r="24" stroke="#f1d5a8" stroke-opacity=".65" stroke-width="1"/>
              <circle cx="140" cy="196" r="22" fill="#5f3b29" fill-opacity=".32"/>
              <circle cx="140" cy="196" r="18.5" fill="url(#keyholeDepth)"/>
              <circle cx="134" cy="190" r="4.5" fill="#f9e7ca" opacity=".13" filter="url(#softBlur)"/>
              <path d="M130.5 210H149.5L144 236.5C143.2 240 136.8 240 136 236.5L130.5 210Z" fill="url(#keyholeDepth)"/>
              <path d="M133 211.5H147" stroke="#eac797" stroke-opacity=".2" stroke-width="1" stroke-linecap="round"/>

              <path d="M140 264.5C140 264.5 131.8 259.4 131.8 254.1C131.8 251.2 134.1 249.1 136.8 249.1C138.3 249.1 139.4 249.8 140 250.8C140.6 249.8 141.7 249.1 143.2 249.1C145.9 249.1 148.2 251.2 148.2 254.1C148.2 259.4 140 264.5 140 264.5Z" fill="#614128" fill-opacity=".42"/>
            </g>
          </svg>
        </button>

        <p class="unlock-cue">
          <span class="unlock-cue__spark" aria-hidden="true">✦</span>
          轻触锁孔，打开只属于我们的回忆
          <span class="unlock-cue__spark" aria-hidden="true">✦</span>
        </p>
      </div>
    </main>

    <footer class="footer">
      <span>Since the day we met</span>
      <span class="footer__center">为一个人，留一整个世界</span>
      <span>Est. forever <i>♡</i></span>
    </footer>
  </div>
</template>
