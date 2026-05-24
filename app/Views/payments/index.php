<?php $pageTitle = 'Payments'; ?>

<div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Payment Links</h1>
</div>

<!-- Status filters -->
<div class="flex flex-wrap gap-2 mb-5">
    <?php foreach (['' => 'All', 'pending' => 'Pending', 'paid' => 'Paid', 'expired' => 'Expired', 'cancelled' => 'Cancelled'] as $val => $label): ?>
    <a href="/payments<?= $val ? '?status=' . $val : '' ?>"
       class="px-3 py-1.5 text-sm font-medium rounded-full transition-colors
              <?= $statusFilter === $val ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600' ?>">
        <?= e($label) ?>
    </a>
    <?php endforeach; ?>
</div>

<div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <?php if (empty($payments)): ?>
    <div class="px-6 py-16 text-center">
        <svg class="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
        </svg>
        <p class="text-gray-500 text-sm">No payment links yet.</p>
        <p class="text-gray-400 text-xs mt-1">Generate links from a policy's detail page.</p>
    </div>
    <?php else: ?>
    <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Policy</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Reference</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Created</th>
                    <th class="px-5 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                <?php foreach ($payments as $pl): ?>
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-3.5">
                        <p class="text-sm font-medium text-gray-900"><?= e($pl['first_name'] . ' ' . $pl['last_name']) ?></p>
                        <p class="text-xs text-gray-400"><?= e($pl['email'] ?? '') ?></p>
                    </td>
                    <td class="px-5 py-3.5 hidden sm:table-cell">
                        <p class="text-sm text-gray-700"><?= e($pl['policy_number'] ?: '—') ?></p>
                        <p class="text-xs text-gray-400"><?= e($pl['insurer_name'] ?? '') ?></p>
                    </td>
                    <td class="px-5 py-3.5 text-sm font-mono text-gray-600"><?= e($pl['reference'] ?? '') ?></td>
                    <td class="px-5 py-3.5 text-sm font-semibold text-gray-800">
                        MUR <?= number_format((float)$pl['amount'], 0) ?>
                    </td>
                    <td class="px-5 py-3.5">
                        <span class="text-xs font-medium px-2 py-0.5 rounded-full
                            <?php echo match ($pl['status'] ?? '') {
                                'paid'      => 'bg-green-100 text-green-700',
                                'pending'   => 'bg-amber-100 text-amber-700',
                                'expired'   => 'bg-gray-100 text-gray-500',
                                'cancelled' => 'bg-red-100 text-red-600',
                                default     => 'bg-gray-100 text-gray-600',
                            }; ?>">
                            <?= ucfirst(e($pl['status'] ?? '')) ?>
                        </span>
                    </td>
                    <td class="px-5 py-3.5 text-sm text-gray-400 hidden md:table-cell">
                        <?= date('d M Y', strtotime($pl['created_at'])) ?>
                    </td>
                    <td class="px-5 py-3.5 text-right">
                        <?php if ($pl['payment_url']): ?>
                        <a href="<?= e($pl['payment_url']) ?>" target="_blank" rel="noopener"
                           class="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                            Open link →
                        </a>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
        Showing <?= count($payments) ?> link<?= count($payments) !== 1 ? 's' : '' ?>
    </div>
    <?php endif; ?>
</div>
