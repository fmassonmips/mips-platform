<?php $pageTitle = $is_edit ? 'Edit Policy' : 'New Policy'; ?>

<div class="max-w-3xl">
    <div class="flex items-center gap-3 mb-6">
        <a href="<?= $is_edit ? '/policies/' . (int)($policy['id'] ?? 0) : '/policies' ?>"
           class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
        </a>
        <h1 class="text-2xl font-bold text-gray-900"><?= $is_edit ? 'Edit Policy' : 'New Policy' ?></h1>
    </div>

    <?php if (!empty($errors)): ?>
    <div class="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
        Please fix the errors below.
    </div>
    <?php endif; ?>

    <form method="POST" action="<?= $is_edit ? '/policies/' . (int)($policy['id'] ?? 0) : '/policies' ?>"
          class="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100"
          x-data="policyForm()" x-init="init()">

        <input type="hidden" name="csrf_token" value="<?= e($csrf) ?>">

        <!-- Client & Insurer -->
        <div class="px-6 py-5">
            <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Policy Information</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <?php if (!$is_edit): ?>
                <div class="sm:col-span-2">
                    <label for="client_id" class="block text-sm font-medium text-gray-700 mb-1">Client <span class="text-red-500">*</span></label>
                    <select id="client_id" name="client_id" required
                            class="w-full px-3 py-2 border <?= isset($errors['client_id']) ? 'border-red-400' : 'border-gray-300' ?> rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">— Select client —</option>
                        <?php foreach ($clients as $c): ?>
                        <option value="<?= (int)$c['id'] ?>" <?= ((string)($policy['client_id'] ?? '')) === (string)$c['id'] ? 'selected' : '' ?>>
                            <?= e($c['last_name'] . ', ' . $c['first_name']) ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <?php endif; ?>

                <div>
                    <label for="insurer_id" class="block text-sm font-medium text-gray-700 mb-1">Insurer <span class="text-red-500">*</span></label>
                    <select id="insurer_id" name="insurer_id" required x-model="insurerId"
                            class="w-full px-3 py-2 border <?= isset($errors['insurer_id']) ? 'border-red-400' : 'border-gray-300' ?> rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">— Select insurer —</option>
                        <?php foreach ($insurers as $ins): ?>
                        <option value="<?= (int)$ins['id'] ?>" <?= ((string)($policy['insurer_id'] ?? '')) === (string)$ins['id'] ? 'selected' : '' ?>>
                            <?= e($ins['name']) ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div>
                    <label for="insurer_product_id" class="block text-sm font-medium text-gray-700 mb-1">Product</label>
                    <select id="insurer_product_id" name="insurer_product_id"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">— Select product —</option>
                        <?php foreach ($products as $prod): ?>
                        <option value="<?= (int)$prod['id'] ?>"
                                data-insurer="<?= (int)$prod['insurer_id'] ?>"
                                x-show="!insurerId || insurerId == '<?= (int)$prod['insurer_id'] ?>'"
                                <?= ((string)($policy['insurer_product_id'] ?? '')) === (string)$prod['id'] ? 'selected' : '' ?>>
                            <?= e($prod['product_name']) ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div>
                    <label for="policy_number" class="block text-sm font-medium text-gray-700 mb-1">Insurer Policy Number</label>
                    <input type="text" id="policy_number" name="policy_number"
                           value="<?= e((string)($policy['policy_number'] ?? '')) ?>"
                           placeholder="Leave blank if not yet assigned"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>

                <div>
                    <label for="status" class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select id="status" name="status"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <?php foreach (['draft' => 'Draft', 'active' => 'Active', 'lapsed' => 'Lapsed', 'cancelled' => 'Cancelled', 'renewed' => 'Renewed'] as $val => $label): ?>
                        <option value="<?= $val ?>" <?= ($policy['status'] ?? 'draft') === $val ? 'selected' : '' ?>>
                            <?= $label ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div>
                    <label for="cover_type" class="block text-sm font-medium text-gray-700 mb-1">Cover Type</label>
                    <input type="text" id="cover_type" name="cover_type"
                           value="<?= e((string)($policy['cover_type'] ?? '')) ?>"
                           placeholder="e.g. Motor Comprehensive"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>

                <div>
                    <label for="payment_frequency" class="block text-sm font-medium text-gray-700 mb-1">Payment Frequency</label>
                    <select id="payment_frequency" name="payment_frequency"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <?php foreach (['annual' => 'Annual', 'semi_annual' => 'Semi-Annual', 'quarterly' => 'Quarterly', 'monthly' => 'Monthly'] as $val => $label): ?>
                        <option value="<?= $val ?>" <?= ($policy['payment_frequency'] ?? 'annual') === $val ? 'selected' : '' ?>>
                            <?= $label ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
        </div>

        <!-- Dates & Financials -->
        <div class="px-6 py-5">
            <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Dates & Financials</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label for="start_date" class="block text-sm font-medium text-gray-700 mb-1">Start Date <span class="text-red-500">*</span></label>
                    <input type="date" id="start_date" name="start_date" required
                           value="<?= e((string)($policy['start_date'] ?? '')) ?>"
                           class="w-full px-3 py-2 border <?= isset($errors['start_date']) ? 'border-red-400' : 'border-gray-300' ?> rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <?php if (isset($errors['start_date'])): ?><p class="mt-1 text-xs text-red-600"><?= e($errors['start_date']) ?></p><?php endif; ?>
                </div>
                <div>
                    <label for="end_date" class="block text-sm font-medium text-gray-700 mb-1">End Date <span class="text-red-500">*</span></label>
                    <input type="date" id="end_date" name="end_date" required
                           value="<?= e((string)($policy['end_date'] ?? '')) ?>"
                           class="w-full px-3 py-2 border <?= isset($errors['end_date']) ? 'border-red-400' : 'border-gray-300' ?> rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <?php if (isset($errors['end_date'])): ?><p class="mt-1 text-xs text-red-600"><?= e($errors['end_date']) ?></p><?php endif; ?>
                </div>
                <div>
                    <label for="premium_amount" class="block text-sm font-medium text-gray-700 mb-1">Premium Amount (MUR) <span class="text-red-500">*</span></label>
                    <input type="text" id="premium_amount" name="premium_amount" required
                           value="<?= e((string)($policy['premium_amount'] ?? '')) ?>"
                           placeholder="0.00"
                           class="w-full px-3 py-2 border <?= isset($errors['premium_amount']) ? 'border-red-400' : 'border-gray-300' ?> rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <?php if (isset($errors['premium_amount'])): ?><p class="mt-1 text-xs text-red-600"><?= e($errors['premium_amount']) ?></p><?php endif; ?>
                </div>
                <div>
                    <label for="sum_insured" class="block text-sm font-medium text-gray-700 mb-1">Sum Insured (MUR)</label>
                    <input type="text" id="sum_insured" name="sum_insured"
                           value="<?= e((string)($policy['sum_insured'] ?? '')) ?>"
                           placeholder="0.00"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
                <div>
                    <label for="excess_amount" class="block text-sm font-medium text-gray-700 mb-1">Excess Amount (MUR)</label>
                    <input type="text" id="excess_amount" name="excess_amount"
                           value="<?= e((string)($policy['excess_amount'] ?? '')) ?>"
                           placeholder="0.00"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
                <div>
                    <label for="broker_commission_pct" class="block text-sm font-medium text-gray-700 mb-1">Broker Commission (%)</label>
                    <input type="number" id="broker_commission_pct" name="broker_commission_pct" min="0" max="100" step="0.1"
                           value="<?= e((string)($policy['broker_commission_pct'] ?? '')) ?>"
                           placeholder="0"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
            </div>
        </div>

        <!-- Additional -->
        <div class="px-6 py-5">
            <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Additional Details</h2>
            <div class="space-y-4">
                <div>
                    <label for="asset_description" class="block text-sm font-medium text-gray-700 mb-1">Asset Description</label>
                    <input type="text" id="asset_description" name="asset_description"
                           value="<?= e((string)($policy['asset_description'] ?? '')) ?>"
                           placeholder="e.g. 2022 Toyota Aqua — ABC 1234"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
                <div class="flex items-center gap-2">
                    <input type="checkbox" id="inspection_required" name="inspection_required" value="1"
                           <?= !empty($policy['inspection_required']) ? 'checked' : '' ?>
                           class="rounded border-gray-300 text-indigo-600">
                    <label for="inspection_required" class="text-sm text-gray-700">Inspection required</label>
                </div>
                <div>
                    <label for="notes" class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea id="notes" name="notes" rows="3"
                              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                              placeholder="Optional internal notes…"><?= e((string)($policy['notes'] ?? '')) ?></textarea>
                </div>
            </div>
        </div>

        <!-- Actions -->
        <div class="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3 rounded-b-xl">
            <a href="<?= $is_edit ? '/policies/' . (int)($policy['id'] ?? 0) : '/policies' ?>"
               class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
                Cancel
            </a>
            <button type="submit"
                    class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                <?= $is_edit ? 'Save Changes' : 'Create Policy' ?>
            </button>
        </div>
    </form>
</div>

<script>
function policyForm() {
    return {
        insurerId: '<?= e((string)($policy['insurer_id'] ?? '')) ?>',
        init() {}
    };
}
</script>
