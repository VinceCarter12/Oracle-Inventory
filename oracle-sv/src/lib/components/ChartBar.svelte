<script lang="ts">
  interface BarPoint {
    month: string;
    assignments: number;
    returns: number;
  }

  let {
    data = [],
    loading = false,
  }: {
    data?: BarPoint[];
    loading?: boolean;
  } = $props();

  // Fixed viewBox — SVG scales to container width
  const VW = 320;
  const VH = 130;
  const CHART_H = 96;   // bar area height
  const BAR_W   = 10;   // width of each individual bar
  const BAR_GAP = 3;    // gap between the two bars in a group

  const maxVal = $derived(
    data.length ? Math.max(1, ...data.flatMap(d => [d.assignments, d.returns])) : 1
  );

  const slotW = $derived(data.length ? VW / data.length : VW);
</script>

{#if loading || !data.length}
  <div class="chart-placeholder" style="height: {VH}px">
    <span>{loading ? 'Loading…' : 'No data yet'}</span>
  </div>
{:else}
  <div class="chart-wrap">
    <svg
      viewBox="0 0 {VW} {VH}"
      width="100%"
      aria-label="Activity bar chart — assignments and returns per month"
      role="img"
    >
      {#each data as point, i (point.month)}
        {@const centerX  = i * slotW + slotW / 2}
        {@const bar1X    = centerX - BAR_W - BAR_GAP / 2}
        {@const bar2X    = centerX + BAR_GAP / 2}
        {@const assignH  = Math.max(2, (point.assignments / maxVal) * CHART_H)}
        {@const returnH  = Math.max(2, (point.returns     / maxVal) * CHART_H)}

        <!-- Assignment bar -->
        <rect
          x={bar1X}
          y={CHART_H - assignH}
          width={BAR_W}
          height={assignH}
          fill="var(--ink)"
          rx="2"
        />

        <!-- Return bar -->
        <rect
          x={bar2X}
          y={CHART_H - returnH}
          width={BAR_W}
          height={returnH}
          fill="var(--link)"
          rx="2"
          opacity="0.7"
        />

        <!-- Month label -->
        <text
          x={centerX}
          y={CHART_H + 16}
          text-anchor="middle"
          class="bar-label"
        >{point.month}</text>
      {/each}

      <!-- Baseline -->
      <line x1="0" y1={CHART_H} x2={VW} y2={CHART_H} stroke="var(--hairline)" stroke-width="1" />
    </svg>

    <div class="legend">
      <span class="legend-item">
        <span class="dot" style="background: var(--ink)"></span>
        Assigned
      </span>
      <span class="legend-item">
        <span class="dot" style="background: var(--link); opacity: 0.7"></span>
        Returned
      </span>
    </div>
  </div>
{/if}

<style>
  .chart-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .chart-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--mute);
    font-family: var(--font-sans);
  }

  .bar-label {
    font-size: 9px;
    fill: var(--mute);
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .legend {
    display: flex;
    gap: 16px;
    padding-top: 2px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--mute);
    font-family: var(--font-sans);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }
</style>
