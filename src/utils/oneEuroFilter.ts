// One-Euro filter for noisy 1-D signals.
//   Casiez, Roussel & Vogel, "1€ Filter: A Simple Speed-based Low-pass Filter
//   for Noisy Input in Interactive Systems", CHI 2012.
//
// It is an adaptive low-pass filter: it smooths heavily when the signal is
// slow (fixation jitter) and follows quickly when it moves fast (saccades).
// We instantiate one per axis (x, y) and feed it the raw gaze coordinate
// plus the sample timestamp (ms since epoch).
//
// Tuning intuition:
//   minCutoff (Hz) — smoothing floor while idle. Lower = smoother but laggier.
//   beta           — speed sensitivity. Higher = follows fast saccades better.
//   dCutoff (Hz)   — cutoff applied to the derivative estimate; usually 1.

export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    public minCutoff: number = 1.0,
    public beta: number = 0.5,
    public dCutoff: number = 1.0,
  ) {}

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  // t is the sample timestamp in milliseconds (e.g. Date.now()).
  filter(x: number, t: number): number {
    if (this.tPrev === null || this.xPrev === null) {
      this.tPrev = t;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }
    // dt in seconds; clamp to a 1ms floor in case timestamps collide.
    const dt = Math.max(1e-3, (t - this.tPrev) / 1000);
    const dxRaw = (x - this.xPrev) / dt;
    const aD = smoothingFactor(dt, this.dCutoff);
    const dxHat = aD * dxRaw + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const aX = smoothingFactor(dt, cutoff);
    const xHat = aX * x + (1 - aX) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return xHat;
  }
}

function smoothingFactor(dt: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}
