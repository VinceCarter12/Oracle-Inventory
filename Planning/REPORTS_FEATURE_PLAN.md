# Reports Page — Feature Implementation Plan

---

## 1. Feature Overview

### What problem does this solve?
Current pages (Dashboard, Assignments, Assets, Employees, Sites) provide **real-time operational views** but lack:
- Historical trend analysis (asset condition degradation over time)
- Cross-entity aggregate insights (department utilization, site comparisons)
- Data export for auditing/management reporting

### Who is it for?
**Sir Jay** (IT manager / admin) who needs:
- Monthly/quarterly reports for management
- Asset depreciation tracking
- Evidence for equipment replacement budgets
- Audit trail exports for compliance

### Key Functionality
1. **Time-series analytics** — asset condition trends, movement frequency
2. **Cross-entity summaries** — department utilization, site comparisons
3. **Export capabilities** — CSV download for external analysis

---

## 2. Technical Design

### Data Flow
```
User selects filters   →   Frontend fetches aggregated data   →   API queries MovementLog + AssetAssignment
         ↓                                                                         ↓
    Displays charts                                                         Groups by dept/site/time
         ↓                                                                         ↓
  Export CSV button    ←─────────────────────────────────────────────────  Formats as CSV blob
```

### Component Structure
```
oracle-sv/src/routes/(dashboard)/reports/
├── +page.svelte                    # Main reports page
└── components/
    ├── ConditionTrendChart.svelte  # Line chart: asset condition over time
    ├── MovementFrequency.svelte    # Bar chart: most-moved assets
    ├── DeptUtilization.svelte      # Table: assets per department
    └── ExportButton.svelte         # CSV/PDF export trigger
```

### API Endpoints (New)
```typescript
GET /api/reports/condition-trend
  ?startDate=2026-01-01&endDate=2026-05-31
  → { dates: string[], usable: number[], for_repair: number[], for_disposal: number[] }

GET /api/reports/movement-frequency
  ?limit=20
  → { assetId, assetName, movementCount, lastMovedAt }[]

GET /api/reports/dept-utilization
  → { deptId, deptName, totalAssets, activeAssignments, utilizationPct }[]

GET /api/reports/export
  ?type=csv&report=condition-trend&startDate=...&endDate=...
  → CSV file download (Content-Disposition: attachment)
```

### Database Queries
Uses **existing** Prisma models — no schema changes needed:

1. **Condition Trend**: Group `MovementLog` by `createdAt` (monthly buckets) + join `Asset.condition`
2. **Movement Frequency**: Count `MovementLog` per `assetId`, order by count DESC
3. **Dept Utilization**: Count `AssetAssignment` grouped by `Employee.departmentId`

---

## 3. What to EXCLUDE (Avoid Redundancy)

| ❌ Do NOT Include               | ✅ Why                             |
| ------------------------------ | --------------------------------- |
| Live assignment list           | Already on `/assignments` page    |
| Individual employee asset list | Already on `/employees/[id]` page |
| Per-asset detail view          | Already on `/assets/[id]` page    |
| Real-time activity feed        | Already on `/dashboard` page      |
| "Due this week" counter        | Already on `/assignments` KPI row |

**Reports page = aggregates + trends + exports ONLY**

---

## 4. Implementation Plan

### Phase 1: Backend API (Day 1 — 4 hours)

#### 4.1 Create API route files
**New files:**
```
oracle-api/src/routes/reports.ts
```

**Tasks:**
- [ ] `GET /api/reports/condition-trend` — Query `MovementLog` + `Asset`, group by month
- [ ] `GET /api/reports/movement-frequency` — Count movements per asset
- [ ] `GET /api/reports/dept-utilization` — Join `AssetAssignment` → `Employee` → `Department`
- [ ] Add routes to `oracle-api/src/index.ts` as `app.use('/api/reports', reportsRouter)`

**Sample Prisma query (condition trend):**
```typescript
const logs = await prisma.movementLog.findMany({
  where: {
    createdAt: { gte: startDate, lte: endDate },
  },
  include: { asset: { select: { condition: true } } },
  orderBy: { createdAt: 'asc' },
});

// Group by month + condition
const grouped = logs.reduce((acc, log) => {
  const month = log.createdAt.toISOString().slice(0, 7); // "2026-05"
  if (!acc[month]) acc[month] = { usable: 0, for_repair: 0, for_disposal: 0 };
  acc[month][log.asset.condition]++;
  return acc;
}, {});
```

---

### Phase 2: Frontend Components (Day 2 — 6 hours)

#### 2.1 Page scaffold
**File:** `oracle-sv/src/routes/(dashboard)/reports/+page.svelte`

**Structure:**
```svelte
<script lang="ts">
  import ConditionTrendChart from './components/ConditionTrendChart.svelte';
  import MovementFrequency from './components/MovementFrequency.svelte';
  import DeptUtilization from './components/DeptUtilization.svelte';
  import ExportButton from './components/ExportButton.svelte';

  let startDate = $state('2026-01-01');
  let endDate = $state('2026-05-31');
</script>

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="page-title">Reports</h1>
      <p class="page-sub">Analytics and exportable summaries</p>
    </div>
    <ExportButton />
  </div>

  <!-- Date range filter -->
  <div class="filter-row">
    <label>Start Date <input type="date" bind:value={startDate} /></label>
    <label>End Date <input type="date" bind:value={endDate} /></label>
  </div>

  <!-- Report sections -->
  <section class="report-section">
    <h2>Asset Condition Trend</h2>
    <ConditionTrendChart {startDate} {endDate} />
  </section>

  <section class="report-section">
    <h2>Movement Frequency</h2>
    <MovementFrequency />
  </section>

  <section class="report-section">
    <h2>Department Utilization</h2>
    <DeptUtilization />
  </section>
</div>
```

#### 2.2 Condition Trend Chart
**File:** `oracle-sv/src/routes/(dashboard)/reports/components/ConditionTrendChart.svelte`

**Tech:** Use **SVG line chart** (no external charting lib to keep bundle small)

**Props:**
```typescript
let { startDate, endDate } = $props<{ startDate: string; endDate: string }>();
```

**Fetch:**
```typescript
const data = $derived.by(async () => {
  const res = await fetch(`/api/reports/condition-trend?startDate=${startDate}&endDate=${endDate}`);
  return res.json();
});
```

**Render:**
- X-axis: months
- Y-axis: count
- 3 lines: usable (green), for_repair (amber), for_disposal (red)
- Use DESIGN.md color tokens

#### 2.3 Movement Frequency Table
**File:** `oracle-sv/src/routes/(dashboard)/reports/components/MovementFrequency.svelte`

**Fetch:**
```typescript
const topMovers = $derived.by(async () => {
  const res = await fetch('/api/reports/movement-frequency?limit=20');
  return res.json();
});
```

**Render:**
```
| Asset Name          | Movements | Last Moved  |
|---------------------|-----------|-------------|
| Dell Latitude 5520  | 12        | May 15, 2026|
| iPhone 14 Pro       | 8         | May 10, 2026|
```

#### 2.4 Department Utilization Table
**File:** `oracle-sv/src/routes/(dashboard)/reports/components/DeptUtilization.svelte`

**Fetch:**
```typescript
const deptStats = $derived.by(async () => {
  const res = await fetch('/api/reports/dept-utilization');
  return res.json();
});
```

**Render:**
```
| Department      | Total Assets | Active Assignments | Utilization % |
|-----------------|--------------|-------------------|---------------|
| IT              | 45           | 38                | 84%           |
| Operations      | 32           | 29                | 91%           |
| Human Resources | 18           | 12                | 67%           |
```

#### 2.5 Export Button
**File:** `oracle-sv/src/routes/(dashboard)/reports/components/ExportButton.svelte`

**Implementation:**
```typescript
async function exportCSV() {
  const res = await fetch('/api/reports/export?type=csv&report=condition-trend&startDate=...&endDate=...');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oracle-inventory-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

### Phase 3: Styling (Day 2 — 2 hours)

**File:** `oracle-sv/src/routes/(dashboard)/reports/+page.svelte` (scoped `<style>`)

**Add classes:**
```css
.report-section {
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
}

.report-section h2 {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.6px;
  margin-bottom: 16px;
  color: var(--ink);
}

.filter-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.filter-row label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--body);
}

.filter-row input[type="date"] {
  padding: 8px 12px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 13px;
}
```

---

### Phase 4: Integration & Testing (Day 3 — 4 hours)

#### 4.1 Integration
- [ ] Wire API calls to actual backend endpoints
- [ ] Test with seed data from `oracle-api/prisma/seed.ts`
- [ ] Verify chart renders correctly with real data
- [ ] Test CSV export downloads with proper filename

#### 4.2 Error Handling
- [ ] Show spinner while fetching data
- [ ] Display "No data available" if API returns empty array
- [ ] Handle API errors gracefully (toast notification)

#### 4.3 Responsive Design
- [ ] Stack filter inputs vertically on mobile
- [ ] Make tables horizontally scrollable on small screens
- [ ] Scale chart SVG to container width

---

## 5. File Changes Summary

### New Files
```
oracle-api/src/routes/reports.ts                           # API routes
oracle-sv/src/routes/(dashboard)/reports/+page.svelte       # Main page
oracle-sv/src/routes/(dashboard)/reports/components/
  ├── ConditionTrendChart.svelte                           # Chart component
  ├── MovementFrequency.svelte                             # Table component
  ├── DeptUtilization.svelte                               # Table component
  └── ExportButton.svelte                                  # Export trigger
```

### Modified Files
```
oracle-api/src/index.ts                  # Add reports router
PLAN.md                                  # Update Phase 7 checklist
```

---

## 6. Dependencies

### No new npm packages required
All functionality uses **existing** dependencies:
- Prisma (already installed) — for queries
- SvelteKit fetch API — for data loading
- Native `Blob` + `URL.createObjectURL` — for CSV download

### Why no charting library?
- Keeps bundle size small
- Hand-coded SVG gives full control over design system colors
- Only need simple line + bar charts (not complex visualizations)

---

## 7. Testing Strategy

### Manual Testing Checklist
- [ ] Condition trend chart shows correct monthly breakdown
- [ ] Movement frequency lists top 20 most-moved assets
- [ ] Department utilization calculates percentages correctly
- [ ] CSV export downloads with correct data
- [ ] Date range filter updates chart data
- [ ] Page loads without console errors
- [ ] Mobile layout doesn't break tables

### API Testing (Postman / curl)
```bash
# Test condition trend
curl "http://localhost:3001/api/reports/condition-trend?startDate=2026-01-01&endDate=2026-05-31"

# Test movement frequency
curl "http://localhost:3001/api/reports/movement-frequency?limit=20"

# Test dept utilization
curl "http://localhost:3001/api/reports/dept-utilization"
```

---

## 8. Rollout Plan

### Step 1: Backend First
Build and test all 3 API endpoints in isolation before touching frontend.

### Step 2: Component-by-Component
Build each report section independently:
1. Condition Trend (most complex — chart rendering)
2. Movement Frequency (simpler — table)
3. Dept Utilization (simpler — table)
4. Export button last (depends on all reports working)

### Step 3: Integration
Wire components together on main page, test as a whole.

### Step 4: Deploy
- Push to `oracle-sv` branch
- Update `PLAN.md` Phase 7 checklist
- Deploy to Hostinger via FTP (if applicable)

---

## 9. Success Criteria

✅ **Feature is "done" when:**
- [ ] All 3 report sections display real data from API
- [ ] Date range filter updates condition trend chart
- [ ] CSV export downloads with correct filename + data
- [ ] No console errors on page load
- [ ] Responsive layout works on mobile (tables scroll)
- [ ] Uses DESIGN.md color tokens consistently
- [ ] Page loads in < 2 seconds with seed data

---

## 10. Time Estimate

| Phase | Task | Estimated Time |
|-------|------|---------------|
| 1 | Backend API routes | 4 hours |
| 2 | Frontend components | 6 hours |
| 3 | Styling | 2 hours |
| 4 | Integration & testing | 4 hours |
| **Total** | | **16 hours (2 days)** |

**Rule of thumb applied:** Doubled from initial 8-hour estimate to account for edge cases, debugging, and polish.

---

## 11. Next Steps

1. ✅ **Review this plan** — Confirm alignment with user expectations
2. ⬜ **Set up dev environment** — Ensure Prisma migrations are applied, seed data exists
3. ⬜ **Start Phase 1** — Build backend API routes first
4. ⬜ **Test incrementally** — Don't wait until the end to test
5. ⬜ **Update PLAN.md** — Check off Phase 7 tasks as completed

---

## 12. Open Questions / Decisions Needed

1. **Chart library preference?**
   - Current plan: Hand-coded SVG (no deps)
   - Alternative: Lightweight lib like Chart.js or Recharts
   - **Decision:** Stick with SVG unless complexity grows

2. **PDF export in addition to CSV?**
   - Current plan: CSV only
   - Alternative: Add PDF via `jsPDF` or server-side `puppeteer`
   - **Decision:** CSV first, PDF in Phase 8 if needed

3. **Real-time data refresh?**
   - Current plan: Manual page reload
   - Alternative: Auto-refresh every 30s
   - **Decision:** Manual refresh for now (reports are historical, not real-time)

---

**End of Feature Plan**
