<script lang="ts">
  interface SeriesDef {
    key: string;
    label: string;
    color: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type DataPoint = { [key: string]: any };

  let {
    data = [],
    series = [],
    labelKey = 'month',
    loading = false,
  }: {
    data?: DataPoint[];
    series?: SeriesDef[];
    labelKey?: string;
    loading?: boolean;
  } = $props();

  // Fixed viewBox — SVG scales to container width
  const VW = 320;
  const VH = 130;
  const CHART_H = 96; // plot area height
  const PAD_X = 14;

  const maxVal = $derived(
    Math.max(1, ...data.flatMap(d => series.map(s => Number(d[s.key]) || 0)))
  );

  const xFor = $derived((i: number) =>
    data.length <= 1 ? VW / 2 : PAD_X + (i * (VW - PAD_X * 2)) / (data.length - 1)
  );

  function yFor(v: number): number {
    return CHART_H - (v / maxVal) * (CHART_H - 12);
  }

  const lines = $derived(
    series.map(s => ({
      ...s,
      path: data
        .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)} ${yFor(Number(d[s.key]) || 0).toFixed(1)}`)
        .join(' '),
      points: data.map((d, i) => ({ x: xFor(i), y: yFor(Number(d[s.key]) || 0), v: Number(d[s.key]) || 0 })),
    }))
  );
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
      aria-label="Line chart"
      role="img"
    >
      <!-- Baseline -->
      <line x1="0" y1={CHART_H} x2={VW} y2={CHART_H} stroke="var(--hairline)" stroke-width="1" />

      {#each lines as line (line.key)}
        <path d={line.path} fill="none" stroke={line.color} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        {#each line.points as p}
          <circle cx={p.x} cy={p.y} r="2.4" fill={line.color} />
        {/each}
      {/each}

      <!-- X labels -->
      {#each data as d, i}
        <text x={xFor(i)} y={CHART_H + 16} text-anchor="middle" class="axis-label">{d[labelKey]}</text>
      {/each}
    </svg>

    <div class="legend">
      {#each series as s (s.key)}
        <span class="legend-item">
          <span class="dot" style="background: {s.color}"></span>
          {s.label}
        </span>
      {/each}
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

  .axis-label {
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
    flex-wrap: wrap;
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
