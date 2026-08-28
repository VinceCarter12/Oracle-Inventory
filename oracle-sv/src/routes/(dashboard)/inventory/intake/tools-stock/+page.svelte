<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';

  const CATEGORY_OPTIONS = [
    { value: 'hand_tools', label: 'Hand tools' },
    { value: 'power_tools', label: 'Power tools' },
    { value: 'cables_connectors', label: 'Cables & connectors' },
    { value: 'electrical_supplies', label: 'Electrical supplies' },
    { value: 'consumables', label: 'Consumables' },
    { value: 'safety_ppe', label: 'Safety & PPE' },
    { value: 'spare_parts', label: 'Spare parts / accessories' },
    { value: 'cleaning_supplies', label: 'Cleaning supplies' },
    { value: 'other', label: 'Other' }
  ];
  const UNIT_OPTIONS = [
    { value: 'piece', label: 'Piece' },
    { value: 'box', label: 'Box' },
    { value: 'pack', label: 'Pack' },
    { value: 'set', label: 'Set' },
    { value: 'pair', label: 'Pair' },
    { value: 'roll', label: 'Roll' },
    { value: 'meter', label: 'Meter' },
    { value: 'liter', label: 'Liter' },
    { value: 'bottle', label: 'Bottle' },
    { value: 'kilogram', label: 'Kilogram' },
    { value: 'other', label: 'Other' }
  ];

  let name                = $state('');
  let category             = $state('hand_tools');
  let categoryOther        = $state('');
  let unitOfMeasure        = $state('piece');
  let unitOfMeasureOther   = $state('');
  let description          = $state('');
  let isSerialized         = $state(false);
  let saving               = $state(false);
  let error                = $state('');
  let idempotencyKey       = $state('');

  async function submit() {
    error = '';
    const resolvedCategory = category === 'other' ? categoryOther.trim() : category;
    const resolvedUnit = unitOfMeasure === 'other' ? unitOfMeasureOther.trim() : unitOfMeasure;
    if (!name.trim() || !resolvedCategory || !resolvedUnit) {
      error = 'Item name, category, and unit of measure are required.';
      return;
    }
    saving = true;
    try {
      if (!idempotencyKey) idempotencyKey = crypto.randomUUID();
      await api.post('/api/stock/items', {
        name: name.trim(),
        category: resolvedCategory,
        unitOfMeasure: resolvedUnit,
        description: description.trim() || undefined,
        isSerialized
      }, { 'Idempotency-Key': idempotencyKey });
      await goto('/stock');
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Unable to create stock item.';
    } finally {
      saving = false;
    }
  }

  function handleCancel() {
    goto('/stock');
  }
</script>

<svelte:head><title>Create Stock Item | Oracle Inventory</title></svelte:head>

<div class="page">
  <Breadcrumb crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tools & Stock', href: '/stock' }, { label: 'Create Stock Item' }]} />

  <div class="page-header">
    <div>
      <h1 class="page-title">Create stock item</h1>
      <p class="page-sub">Use this for quantity-managed inventory. Individually tracked or serialized equipment belongs in Asset intake. SKU is generated automatically from the category.</p>
    </div>
    {#if can('manage_stock')}
      <div class="header-actions">
        <button type="button" class="btn-ghost" onclick={handleCancel} disabled={saving}>Cancel</button>
        <button type="submit" form="stock-item-form" class="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create stock item'}</button>
      </div>
    {/if}
  </div>

  {#if !can('manage_stock')}
    <div class="card notice-card">
      <h2 class="notice-title">Permission required</h2>
      <p class="notice-text">You do not have permission to create stock items.</p>
    </div>
  {:else}
    {#if error}<div class="form-error">{error}</div>{/if}

    <form id="stock-item-form" onsubmit={(event) => { event.preventDefault(); submit(); }} class="form-body">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Item details</h2>
        </div>
        <div class="card-body">
          <div class="fields-grid">
            <div class="field">
              <label class="field-label" for="name">Item name <span class="required">*</span></label>
              <input id="name" class="field-input" bind:value={name} maxlength="160" placeholder="e.g. Cat5e cable, 305m box" />
            </div>
            <div class="field">
              <label class="field-label" for="category">Category <span class="required">*</span></label>
              <select id="category" class="field-select" bind:value={category}>
                {#each CATEGORY_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
              </select>
              {#if category === 'other'}
                <input class="field-input" style="margin-top: 8px;" bind:value={categoryOther} placeholder="Enter category" maxlength="80" />
              {/if}
            </div>
            <div class="field">
              <label class="field-label" for="unit">Unit of measure <span class="required">*</span></label>
              <select id="unit" class="field-select" bind:value={unitOfMeasure}>
                {#each UNIT_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
              </select>
              {#if unitOfMeasure === 'other'}
                <input class="field-input" style="margin-top: 8px;" bind:value={unitOfMeasureOther} placeholder="Enter unit" maxlength="40" />
              {/if}
            </div>
          </div>

          <label class="checkbox-row">
            <input type="checkbox" class="checkbox" bind:checked={isSerialized} />
            <span class="checkbox-label">This stock is serialized</span>
          </label>

          <div class="field field-textarea">
            <label class="field-label" for="description">Description <span class="optional">(optional)</span></label>
            <textarea id="description" class="field-textarea-input" bind:value={description} rows="4" maxlength="1000"></textarea>
          </div>
        </div>
      </section>
    </form>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .page-title  { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .page-sub    { font-size: 13px; color: var(--mute); margin-top: 3px; max-width: 560px; }

  .header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: none;
    background: var(--ink); color: var(--on-primary);
    transition: opacity 120ms ease; line-height: 1;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 13px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 500; font-family: var(--font-sans);
    cursor: pointer; border: 1px solid var(--hairline);
    background: var(--canvas); color: var(--ink);
    transition: background 100ms ease; line-height: 1;
  }
  .btn-ghost:hover:not(:disabled) { background: var(--canvas-soft-2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .form-body { display: flex; flex-direction: column; gap: 16px; }

  .card { background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--r-lg); }
  .card-header { padding: 16px 20px 12px; border-bottom: 1px solid var(--hairline); }
  .card-title { font-size: 14px; font-weight: 600; color: var(--ink); font-family: var(--font-sans); letter-spacing: -0.2px; }
  .card-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

  .notice-card { padding: 20px; }
  .notice-title { font-size: 14px; font-weight: 600; color: var(--ink); margin: 0 0 6px; }
  .notice-text { font-size: 13px; color: var(--body); margin: 0; }

  .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }

  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 12.5px; font-weight: 500; color: var(--body); font-family: var(--font-sans); letter-spacing: -0.1px; }
  .required { color: var(--error); }
  .optional { color: var(--mute); font-weight: 400; }

  .field-input, .field-select {
    height: 34px; padding: 0 10px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); color: var(--ink);
    font-size: 13.5px; font-family: var(--font-sans);
    outline: none; transition: border-color 120ms ease, box-shadow 120ms ease;
    width: 100%;
  }
  .field-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 30px;
    cursor: pointer;
  }
  .field-input:focus, .field-select:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }
  .field-input::placeholder { color: var(--mute); }

  .field-textarea-input {
    width: 100%; padding: 10px 12px;
    border: 1px solid var(--hairline); border-radius: var(--r-sm);
    background: var(--canvas); color: var(--ink);
    font-size: 13.5px; font-family: var(--font-sans);
    outline: none; resize: vertical; line-height: 1.5;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  .field-textarea-input:focus { border-color: var(--link); box-shadow: 0 0 0 3px var(--link-bg-soft); }

  .checkbox-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .checkbox { width: 15px; height: 15px; accent-color: var(--link); cursor: pointer; flex-shrink: 0; }
  .checkbox-label { font-size: 13.5px; font-weight: 500; color: var(--ink); font-family: var(--font-sans); }

  .form-error {
    padding: 10px 14px; background: var(--error-soft); color: var(--error);
    border-radius: var(--r-sm); font-size: 13px; font-family: var(--font-sans);
  }

  @media (max-width: 900px) { .fields-grid { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { .page-header { flex-direction: column; } .header-actions { width: 100%; } .header-actions .btn-ghost, .header-actions .btn-primary { flex: 1; justify-content: center; } }
</style>
