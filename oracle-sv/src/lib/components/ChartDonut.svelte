<script lang="ts">
  interface Segment {
    label: string;
    value: number;
    color: string;
  }

  let {
    segments = [],
    total,          // optional — defaults to sum of segments
    loading  = false,
    size     = 140,
  }: {
    segments?: Segment[];
    total?:    number;
    loading?:  boolean;
    size?:     number;
  } = $props();

  const STROKE = 22;

  const r             = $derived(size / 2 - STROKE / 2);
  const circumference = $derived(2 * Math.PI * r);
  const cx            = $derived(size / 2);

  // Fall back to summing segments if total not provided
  const derivedTotal = $derived(
    total ?? segments.reduce((s, seg) => s + seg.value, 0)
  );

  // Build arc positions using rotate(-90) approach:
  // Each circle is rotated -90° so strokes start at 12 o'clock.
  // dashOffset = -cumDash advances each segment clockwise past previous ones.
  const arcs = $derived.by(() => {
    if (!segments.some(s => s.value > 0)) return [];
    let cumDash = 0;
    return segments
      .filter(s => s.value > 0)
      .map(s => {
        const dash       = derivedTotal > 0 ? (s.value / derivedTotal) * circumference : 0;
        const dashOffset = -cumDash;
        cumDash += dash;
        return {
          label:      s.label,
          color:      s.color,
          dash,
          dashOffset,
          gap:        circumference - dash,
        };
      });
  });
</script>

<div class="donut-wrap">
  <div class="donut-chart">
    {#if loading}
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--hairline)" stroke-width={STROKE} />
      </svg>

    {:else if arcs.length === 0}
      <svg width={size} height={size} aria-label="No condition data" role="img">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--hairline)" stroke-width={STROKE} />
        <text x={cx} y={cx + 4} text-anchor="middle" class="center-num">—</text>
      </svg>

    {:else}
      <svg width={size} height={size} aria-label="Asset condition donut chart" role="img">
        <!-- Background ring -->
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--hairline)" stroke-width={STROKE} />

        <!-- Segment arcs — rotated -90° so strokes start at 12 o'clock -->
        {#each arcs as arc (arc.label)}
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke-width={STROKE}
            stroke-dasharray="{arc.dash} {arc.gap}"
            stroke-dashoffset={arc.dashOffset}
            stroke-linecap="butt"
            transform="rotate(-90 {cx} {cx})"
            style="stroke: {arc.color}"
          />
        {/each}

        <!-- Center labels -->
        <text x={cx} y={cx - 6} text-anchor="middle" class="center-num">{derivedTotal}</text>
        <text x={cx} y={cx + 11} text-anchor="middle" class="center-label">Total</text>
      </svg>
    {/if}
  </div>

  <div class="donut-legend">
    {#each segments as seg (seg.label)}
      <div class="legend-row">
        <span class="legend-dot" style="background: {seg.color}"></span>
        <span class="legend-label">{seg.label}</span>
        <span class="legend-val">{seg.value.toLocaleString()}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .donut-wrap {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .donut-chart {
    flex-shrink: 0;
  }

  .center-num {
    font-size: 22px;
    font-weight: 600;
    fill: var(--ink);
    font-family: var(--font-sans);
    letter-spacing: -0.8px;
  }

  .center-label {
    font-size: 10px;
    fill: var(--mute);
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .donut-legend {
    display: flex;
    flex-direction: column;
    gap: 9px;
    flex: 1;
    min-width: 0;
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .legend-label {
    font-size: 12px;
    color: var(--body);
    font-family: var(--font-sans);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .legend-val {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
    font-family: var(--font-mono);
    flex-shrink: 0;
  }

  @media (max-width: 500px) {
    .donut-wrap { flex-direction: column; align-items: flex-start; }
  }
</style>
