<?php $pageTitle = 'Policies'; ?>

<div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Policies</h1>
    <a href="/policies/create"
       class="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
        <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        New Policy
    </a>
</div>

<!-- Status filters -->
<div class="flex flex-wrap gap-2 mb-5">
    <?php
    $filters = ['' => 'All', 'active' => 'Active', 'draft' => 'Draft', 'lapsed' => 'Lapsed', 'cancelled' => 'Cancelled', 'renewed' => 'Renewed'];
    foreach ($filters as $val => $label):
        $active = $status === $val;
    ?>
    <a href="/policies<?= $val ? '?status=' . $val : '' ?>"
       class="px-3 py-1.5 text-sm font-medium rounded-full transition-colors
              <?= $active ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600' ?>">
        <?= e($label) ?>
    </a>
    <?php endforeach; ?>
</div>

<div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <?php if (empty($policies)): ?>
    <div class="px-6 py-16 text-center">
        <svg class="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p class="text-gray-500 text-sm">No policies found.</p>
        <a href="/policies/create" class="mt-3 inline-block text-indigo-600 hover:text-indigo-800 text-sm font-medium">Create a policy →</a>
    </div>
    <?php else: ?>
    <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Insurer</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Policy #</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Expiry</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Premium</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th class="px-5 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                <?php foreach ($policies as $p):
                    $daysLeft = (int) floor((strtotime($p['end_date']) - time()) / 86400);
                    $expiryClass = $daysLeft < 0 ? 'text-red-600 font-medium' : ($daysLeft <= 30 ? 'text-amber-600 font-medium' : 'text-gray-600');
                ?>
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-3.5">
                        <p class="text-sm font-medium text-gray-900">
                            <?= e($p['first_name'] . ' ' . $p['last_name']) ?>
                        </p>
                        <p class="text-xs text-gray-400"><?= e($p['email'] ?? '') ?></p>
                    </td>
                    <td class="px-5 py-3.5 hidden sm:table-cell">
                        <p class="text-sm text-gray-800"><?= e($p['insurer_name'] ?? '') ?></p>
                        <?php if ($p['product_name']): ?>
                        <p class="text-xs text-gray-400"><?= e($p['product_name']) ?></p>
                        <?php endif; ?>
                    </td>
                    <td class="px-5 py-3.5 text-sm text-gray-600 hidden md:table-cell">
                        <?= e($p['policy_number'] ?: $p['internal_ref'] ?? '—') ?>
                    </td>
                    <td class="px-5 py-3.5 text-sm <?= $expiryClass ?>">
                        <?= date('d M Y', strtotime($p['end_date'])) ?>
                        <?php if ($daysLeft >= 0 && $daysLeft <= 30): ?>
                        <span class="text-xs">(<?= $daysLeft ?>d)</span>
                        <?php elseif ($daysLeft < 0): ?>
                        <span class="text-xs">(expired)</span>
                        <?php endif; ?>
                    </td>
                    <td class="px-5 py-3.5 text-sm font-medium text-gray-700 hidden sm:table-cell">
                        MUR <?= number_format((float)$p['premium_amount'], 0) ?>
                    </td>
                    <td class="px-5 py-3.5">
                        <span class="text-xs font-medium px-2 py-0.5 rounded-full
                            <?php echo match ($p['status']) {
                                'active'    => 'bg-green-100 text-green-700',
                                'draft'     => 'bg-gray-100 text-gray-600',
                                'lapsed'    => 'bg-red-100 text-red-700',
                                'cancelled' => 'bg-red-100 text-red-700',
                                'renewed'   => 'bg-blue-100 text-blue-700',
                                default     => 'bg-gray-100 text-gray-600',
                            }; ?>">
                            <?= ucfirst(e($p['status'])) ?>
                        </span>
                    </td>
                    <td class="px-5 py-3.5 text-right">
                        <a href="/policies/<?= (int)$p['id'] ?>"
                           class="text-sm text-indigo-600 hover:text-indigo-800 font-medium">View</a>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
        Showing <?= count($policies) ?> polic<?= count($policies) !== 1 ? 'ies' : 'y' ?>
    </div>
    <?php endif; ?>
</div>
