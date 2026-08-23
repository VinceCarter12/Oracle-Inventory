<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { can } from '$lib/utils/permissions';

  let sku = $state('');
  let name = $state('');
  let category = $state('tools');
  let unitOfMeasure = $state('piece');
  let description = $state('');
  let isSerialized = $state(false);
  let saving = $state(false);
  let error = $state('');
  let idempotencyKey = $state('');

  async function submit() {
    error = '';
    if (!sku.trim() || !name.trim() || !category.trim() || !unitOfMeasure.trim()) {
      error = 'SKU, item name, category, and unit of measure are required.';
      return;
    }
    saving = true;
    try {
      if (!idempotencyKey) idempotencyKey = crypto.randomUUID();
      await api.post('/api/stock/items', {
        sku: sku.trim(),
        name: name.trim(),
        category: category.trim(),
        unitOfMeasure: unitOfMeasure.trim(),
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
</script>

<svelte:head><title>Create Stock Item | Oracle Inventory</title></svelte:head>

<div class="page">
  <a class="back" href="/stock">← Tools & Stock</a>
  <header>
    <p class="eyebrow">Manual intake</p>
    <h1>Create stock item</h1>
    <p>Use this for quantity-managed inventory. Individually tracked or serialized equipment belongs in Asset intake.</p>
  </header>

  {#if !can('manage_stock')}
    <section class="notice" role="alert"><h2>Permission required</h2><p>You do not have permission to create stock items.</p></section>
  {:else}
    <form onsubmit={(event) => { event.preventDefault(); submit(); }} class="card">
      <label for="sku">SKU <span aria-hidden="true">*</span></label>
      <input id="sku" bind:value={sku} autocomplete="off" maxlength="80" />

      <label for="name">Item name <span aria-hidden="true">*</span></label>
      <input id="name" bind:value={name} maxlength="160" />

      <div class="two-up">
        <div><label for="category">Category <span aria-hidden="true">*</span></label><input id="category" bind:value={category} maxlength="80" /></div>
        <div><label for="unit">Unit of measure <span aria-hidden="true">*</span></label><input id="unit" bind:value={unitOfMeasure} maxlength="40" /></div>
      </div>

      <label class="check"><input type="checkbox" bind:checked={isSerialized} /> This stock is serialized</label>

      <label for="description">Description <span class="optional">(optional)</span></label>
      <textarea id="description" bind:value={description} rows="4" maxlength="1000"></textarea>

      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions"><a href="/stock">Cancel</a><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create stock item'}</button></div>
    </form>
  {/if}
</div>

<style>
  .page { max-width: 760px; margin: 0 auto; padding: 32px 24px 48px; }
  .back { color: var(--body); text-decoration: none; font-size: 14px; }
  header { margin: 24px 0; } .eyebrow { margin: 0 0 5px; color: var(--mute); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h1 { margin: 0; color: var(--ink); font-size: 32px; letter-spacing: -.035em; } header p:last-child { color: var(--body); margin-bottom: 0; }
  .card, .notice { border: 1px solid var(--hairline); border-radius: 12px; background: var(--canvas); padding: 24px; }
  label { display: block; margin: 18px 0 6px; color: var(--ink); font-size: 14px; font-weight: 650; }
  input:not([type='checkbox']), textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--hairline); border-radius: 8px; padding: 10px 12px; color: var(--ink); background: var(--canvas); font: inherit; }
  textarea { resize: vertical; } .two-up { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } .two-up label { margin-top: 18px; }
  .check { display: flex; gap: 9px; align-items: center; font-weight: 500; } .check input { inline-size: 16px; block-size: 16px; }
  .optional { color: var(--mute); font-weight: 400; } .error { color: var(--error); margin: 18px 0 0; } .actions { display: flex; justify-content: flex-end; align-items: center; gap: 16px; margin-top: 24px; } .actions a { color: var(--body); text-decoration: none; } button { border: 0; border-radius: 8px; padding: 10px 14px; background: var(--ink); color: var(--on-primary); font: inherit; font-weight: 600; cursor: pointer; } button:disabled { cursor: wait; opacity: .55; }
  @media (max-width: 640px) { .page { padding: 24px 16px; } .two-up { grid-template-columns: 1fr; gap: 0; } .actions { justify-content: space-between; } }
</style>
