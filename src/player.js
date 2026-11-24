const RATES = [1, 1.25, 0.8];
const CIRCUMFERENCE = 207.3;

function required(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`播放器缺少 #${id}`);
  return node;
}

function finiteDuration(audio) {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
}

function formatTime(value) {
  const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatRate(value) {
  return `${Number.isInteger(value) ? value.toFixed(1) : value.toFixed(2)}×`;
}

function mediaErrorText(error) {
  const messages = {
    1: "录音加载已中止",
    2: "录音文件无法下载",
    3: "录音文件解码失败",
    4: "浏览器不支持此录音",
  };
  return messages[error?.code] || "录音加载失败";
}

function playbackErrorText(error) {
  return error?.name === "NotAllowedError"
    ? "浏览器阻止了播放，请再次点击"
    : "录音播放失败，请重试";
}

function shapeWave(bars, seedValue) {
  const items = bars?.children;
  if (!items?.length) return;
  const seed = Number.parseInt(seedValue, 10) || 19;
  const phaseA = (seed * 1.37) % (Math.PI * 2);
  const phaseB = (seed * 2.71) % (Math.PI * 2);
  const phaseC = (seed * 4.19) % (Math.PI * 2);
  const count = items.length;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const taper = Math.sin(Math.PI * t) ** 0.45;
    const phrase = 0.5 + 0.5 * Math.sin(t * Math.PI * 3.5 + phaseA);
    const cadence = 0.5 + 0.5 * Math.sin(t * Math.PI * 11 + phaseB);
    const detail = 0.5 + 0.5 * Math.cos(t * Math.PI * 23 + phaseC);
    const amplitude = 0.18 + 0.8 * taper * (0.42 * phrase + 0.36 * cadence + 0.22 * detail);
    const bar = items[i];
    bar.style?.setProperty?.("--h", amplitude.toFixed(3));
    bar.style?.setProperty?.("--t", `${(0.95 + 0.55 * detail).toFixed(2)}s`);
    bar.style?.setProperty?.("--dl", `${(-(i * 0.048 + 0.12 * cadence)).toFixed(2)}s`);
  }
}

function syncWave(bars, progress, hasRecording, playing) {
  const items = bars?.children;
  if (!items?.length) return;
  bars.classList?.toggle?.("idle", !hasRecording);
  const count = items.length;
  const headIndex =
    playing && hasRecording ? Math.min(count - 1, Math.floor(progress * count)) : -1;
  for (let i = 0; i < count; i++) {
    const pos = (i + 0.5) / count;
    const state = !hasRecording
      ? "future"
      : i === headIndex || (playing && Math.abs(i - headIndex) <= 1)
        ? "head"
        : pos <= progress
          ? "past"
          : "future";
    if (items[i].dataset) items[i].dataset.state = state;
  }
}

export function createPlayer({ onPrevious, onNext } = {}) {
  const app = required("app");
  const playButton = required("pp");
  const actionButton = required("aPlay");
  const actionText = required("aPlayT");
  const rateButton = required("rate");
  const mode = required("pMode");
  const position = required("pIdx");
  const line = required("pLine");
  const ring = required("ring");
  const seek = required("seek");
  const bars = document.getElementById("bars");
  const previousButton = required("prevL");
  const nextButton = required("nextL");
  const audio = required("audio");
  const actionIcon = actionButton.querySelector?.("use");

  let poem = null;
  let hasRecording = false;
  let hasStarted = false;
  let ended = false;
  let loading = false;
  let errorText = "";
  let rateIndex = 0;
  let selection = 0;

  audio.preload = "metadata";
  seek.min = "0";
  seek.max = "1000";
  line.setAttribute("aria-live", "polite");

  function render() {
    const duration = finiteDuration(audio);
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const progress = duration ? Math.min(1, Math.max(0, current / duration)) : 0;
    const unavailable = !hasRecording;
    const playing = hasRecording && !audio.paused && !audio.ended;

    app.classList.toggle("playing", playing);
    playButton.disabled = unavailable;
    actionButton.disabled = unavailable;
    rateButton.disabled = unavailable;
    seek.disabled = unavailable || !duration;
    seek.value = String(Math.round(progress * 1000));
    seek.style?.setProperty?.("--seek-p", `${(progress * 100).toFixed(2)}%`);
    seek.setAttribute(
      "aria-valuetext",
      `${formatTime(current)} / ${duration ? formatTime(duration) : "--:--"}`,
    );
    ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
    syncWave(bars, progress, hasRecording, playing);

    if (unavailable) {
      actionText.textContent = "暂无录音";
      playButton.setAttribute("aria-label", "此诗暂无录音");
      actionButton.setAttribute("aria-label", "此诗暂无录音");
      mode.textContent = "暂无录音";
      position.textContent = "00:00 / --:--";
      line.textContent = poem?.title ? `《${poem.title}》暂无可用录音` : "请选择诗词";
    } else if (errorText) {
      actionText.textContent = "重新播放";
      playButton.setAttribute("aria-label", "重新尝试播放录音");
      actionButton.setAttribute("aria-label", "重新尝试播放录音");
      mode.textContent = "录音异常";
      position.textContent = `${formatTime(current)} / ${duration ? formatTime(duration) : "--:--"}`;
      line.textContent = errorText;
    } else {
      actionText.textContent = playing
        ? "暂停录音"
        : ended
          ? "重播录音"
          : hasStarted
            ? "继续录音"
            : "播放录音";
      const label = playing ? "暂停录音" : ended ? "重新播放录音" : "播放录音";
      playButton.setAttribute("aria-label", label);
      actionButton.setAttribute("aria-label", label);
      mode.textContent = loading ? "载入合成朗诵" : "合成朗诵";
      position.textContent = `${formatTime(current)} / ${duration ? formatTime(duration) : "--:--"}`;
      line.textContent = loading ? `正在载入《${poem.title}》` : poem.title;
    }

    actionIcon?.setAttribute("href", playing ? "#i-pause" : "#i-play");
    rateButton.textContent = formatRate(audio.playbackRate);
    rateButton.setAttribute("aria-label", `播放倍速 ${audio.playbackRate}`);
  }

  function seekTo(value) {
    const duration = finiteDuration(audio);
    if (!hasRecording || !duration || !Number.isFinite(value)) return;
    audio.currentTime = Math.min(duration, Math.max(0, value));
    ended = audio.currentTime >= duration;
    loading = false;
    render();
  }

  async function toggle() {
    if (!hasRecording) return;
    if (!audio.paused && !audio.ended) {
      audio.pause();
      return;
    }
    if (audio.ended || ended) {
      audio.currentTime = 0;
      ended = false;
    }
    if (audio.error) {
      loading = true;
      audio.load();
    }
    errorText = "";
    render();
    const token = selection;
    try {
      await audio.play();
    } catch (error) {
      if (token !== selection || !hasRecording) return;
      errorText = playbackErrorText(error);
      render();
    }
  }

  function setPoem(nextPoem) {
    selection += 1;
    poem = nextPoem || null;
    const url = poem?.audio?.url;
    hasRecording = typeof url === "string" && url.length > 0;
    hasStarted = false;
    ended = false;
    loading = hasRecording;
    errorText = "";

    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {}
    audio.defaultPlaybackRate = RATES[rateIndex];
    audio.playbackRate = RATES[rateIndex];
    if (hasRecording) {
      audio.src = url;
    } else {
      audio.removeAttribute("src");
    }
    audio.load();
    shapeWave(bars, poem?.id);
    render();
  }

  playButton.addEventListener("click", () => {
    void toggle();
  });
  actionButton.addEventListener("click", () => {
    void toggle();
  });
  rateButton.addEventListener("click", () => {
    if (!hasRecording) return;
    rateIndex = (rateIndex + 1) % RATES.length;
    audio.defaultPlaybackRate = RATES[rateIndex];
    audio.playbackRate = RATES[rateIndex];
    render();
  });
  const seekFromControl = () => {
    const duration = finiteDuration(audio);
    if (duration) seekTo((Number(seek.value) / 1000) * duration);
  };
  seek.addEventListener("input", seekFromControl);
  seek.addEventListener("change", seekFromControl);
  bars?.addEventListener?.("click", (event) => {
    const duration = finiteDuration(audio);
    if (!hasRecording || !duration || typeof bars.getBoundingClientRect !== "function") return;
    const rect = bars.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  });
  previousButton.addEventListener("click", () => {
    audio.pause();
    onPrevious?.();
  });
  nextButton.addEventListener("click", () => {
    audio.pause();
    onNext?.();
  });

  audio.addEventListener("loadstart", () => {
    if (!hasRecording) return;
    loading = true;
    errorText = "";
    render();
  });
  audio.addEventListener("loadedmetadata", () => {
    loading = false;
    errorText = "";
    render();
  });
  audio.addEventListener("durationchange", render);
  audio.addEventListener("canplay", () => {
    loading = false;
    errorText = "";
    render();
  });
  audio.addEventListener("playing", () => {
    loading = false;
    ended = false;
    hasStarted = true;
    errorText = "";
    render();
  });
  audio.addEventListener("play", () => {
    hasStarted = true;
    ended = false;
    errorText = "";
    render();
  });
  audio.addEventListener("pause", render);
  audio.addEventListener("waiting", () => {
    loading = true;
    render();
  });
  audio.addEventListener("timeupdate", render);
  audio.addEventListener("seeked", render);
  audio.addEventListener("ratechange", render);
  audio.addEventListener("ended", () => {
    ended = true;
    loading = false;
    render();
  });
  audio.addEventListener("error", () => {
    loading = false;
    errorText = mediaErrorText(audio.error);
    render();
  });

  render();

  return {
    setPoem,
    toggle,
    seekBy(seconds) {
      seekTo(audio.currentTime + Number(seconds));
    },
  };
}
