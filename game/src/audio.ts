let context: AudioContext | undefined;
export function playTone(kind: "click" | "magic" | "win", enabled: boolean) {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const start = context.currentTime;
    const notes =
      kind === "win"
        ? [392, 494, 587, 784]
        : kind === "magic"
          ? [330, 660]
          : [440];
    notes.forEach((frequency, i) => {
      const oscillator = context!.createOscillator(),
        gain = context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + i * 0.11);
      gain.gain.linearRampToValueAtTime(0.045, start + i * 0.11 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + i * 0.11 + 0.4);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      oscillator.start(start + i * 0.11);
      oscillator.stop(start + i * 0.11 + 0.42);
    });
  } catch {
    /* Audio is optional; game state never depends on playback. */
  }
}
