<?php $pageTitle = 'Policy — ' . ($policy['policy_number'] ?: $policy['internal_ref'] ?? ''); ?>

<div class="flex items-center gap-3 mb-6 flex-wrap">
    <a href="/policies" class="text-gray-400 hover:text-gray-600 transition-colors">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
    </a>
    <h1 class="text-2xl font-bold text-gray-900 flex-1">
        <?= e($policy['first_name'] . ' ' . $policy['last_name']) ?>
        <span class="text-base font-normal text-gray-400 ml-2"><?= e($policy['internal_ref'] ?? '') ?></span>
    </h1>
    <a href="/policies/<?= (int)$policy['id'] ?>/edit"
       class="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors">
        Edit
    </a>
</div>

<div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <!-- Policy details -->
    <div class="space-y-5">
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide">Policy</h2>
                <span class="text-xs font-medium px-2 py-0.5 rounded-full
                    <?php echo match ($policy['status']) {
                        'active'    => 'bg-green-100 text-green-700',
                        'draft'     => 'bg-gray-100 text-gray-600',
                        'lapsed'    => 'bg-red-100 text-red-700',
                        'cancelled' => 'bg-red-100 text-red-700',
                        'renewed'   => 'bg-blue-100 text-blue-700',
                        default     => 'bg-gray-100 text-gray-600',
                    }; ?>">
                    <?= ucfirst(e($policy['status'])) ?>
                </span>
            </div>
            <dl class="space-y-2.5">
                <?php foreach ([
                    ['Insurer', $policy['insurer_name'] ?? ''],
                    ['Policy Number', $policy['policy_number'] ?: '—'],
                    ['Cover Type', $policy['cover_type'] ?: '—'],
                    ['Start Date', $policy['start_date'] ? date('d M Y', strtotime($policy['start_date'])) : '—'],
                    ['End Date', $policy['end_date'] ? date('d M Y', strtotime($policy['end_date'])) : '—'],
                    ['Payment', ucfirst(str_replace('_', '-', $policy['payment_frequency'] ?? ''))],
                ] as [$k, $v]): ?>
                <div>
                    <dt class="text-xs text-gray-400"><?= e($k) ?></dt>
                    <dd class="text-sm text-gray-800 font-medium mt-0.5"><?= e($v) ?></dd>
                </div>
                <?php endforeach; ?>
            </dl>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Financials</h2>
            <dl class="space-y-2.5">
                <div>
                    <dt class="text-xs text-gray-400">Premium</dt>
                    <dd class="text-xl font-bold text-gray-900 mt-0.5">MUR <?= number_format((float)$policy['premium_amount'], 2) ?></dd>
                </div>
                <?php if ($policy['sum_insured']): ?>
                <div>
                    <dt class="text-xs text-gray-400">Sum Insured</dt>
                    <dd class="text-sm font-medium text-gray-800">MUR <?= number_format((float)$policy['sum_insured'], 0) ?></dd>
                </div>
                <?php endif; ?>
                <?php if ($policy['excess_amount']): ?>
                <div>
                    <dt class="text-xs text-gray-400">Excess</dt>
                    <dd class="text-sm font-medium text-gray-800">MUR <?= number_format((float)$policy['excess_amount'], 0) ?></dd>
                </div>
                <?php endif; ?>
                <?php if ($policy['broker_commission_pct']): ?>
                <div>
                    <dt class="text-xs text-gray-400">Commission</dt>
                    <dd class="text-sm font-medium text-gray-800">
                        <?= number_format((float)$policy['broker_commission_pct'], 1) ?>%
                        = MUR <?= number_format((float)($policy['broker_commission_amt'] ?? 0), 2) ?>
                    </dd>
                </div>
                <?php endif; ?>
            </dl>
        </div>

        <?php if ($policy['asset_description']): ?>
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Asset</h2>
            <p class="text-sm text-gray-800"><?= e($policy['asset_description']) ?></p>
            <?php if (!empty($policy['inspection_required'])): ?>
            <p class="mt-2 text-xs font-medium text-amber-600">⚠ Inspection required</p>
            <?php endif; ?>
        </div>
        <?php endif; ?>
    </div>

    <!-- Renewals & Payments -->
    <div class="xl:col-span-2 space-y-6">
        <!-- Generate payment link -->
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 class="font-semibold text-gray-900 mb-3">Generate Payment Link</h2>
            <form method="POST" action="/payments/generate" class="flex items-end gap-3 flex-wrap">
                <input type="hidden" name="csrf_token" value="<?= e(\App\Csrf::token()) ?>">
                <input type="hidden" name="policy_id" value="<?= (int)$policy['id'] ?>">
                <div class="flex-1 min-w-40">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Amount (MUR)</label>
                    <input type="text" name="amount" value="<?= number_format((float)$policy['premium_amount'], 2) ?>"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
                <button type="submit"
                        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                    Generate MIPS Link
                </button>
            </form>
        </div>

        <!-- Renewals -->
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 class="font-semibold text-gray-900">Renewals</h2>
                <a href="/renewals" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View pipeline →</a>
            </div>
            <?php if (empty($renewals)): ?>
            <div class="px-5 py-8 text-center text-gray-400 text-sm">No renewal records yet.</div>
            <?php else: ?>
            <div class="divide-y divide-gray-100">
                <?php foreach ($renewals as $r): ?>
                <div class="px-5 py-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-gray-900">Renewal <?= (int)$r['renewal_year'] ?></span>
                        <span class="text-xs font-medium px-2 py-0.5 rounded-full
                            <?php echo match ($r['status']) {
                                'paid'        => 'bg-green-100 text-green-700',
                                'contacted'   => 'bg-blue-100 text-blue-700',
                                'in_progress' => 'bg-amber-100 text-amber-700',
                                'lapsed'      => 'bg-red-100 text-red-700',
                                default       => 'bg-gray-100 text-gray-600',
                            }; ?>">
                            <?= ucfirst(str_replace('_', ' ', e($r['status']))) ?>
                        </span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-xs text-gray-500">
                        <div><span class="block text-gray-400">J-45</span><?= $r['trigger_date_j45'] ? date('d M', strtotime($r['trigger_date_j45'])) : '—' ?></div>
                        <div><span class="block text-gray-400">J-30</span><?= $r['trigger_date_j30'] ? date('d M', strtotime($r['trigger_date_j30'])) : '—' ?></div>
                        <div><span class="block text-gray-400">J-15</span><?= $r['trigger_date_j15'] ? date('d M', strtotime($r['trigger_date_j15'])) : '—' ?></div>
                    </div>
                    <?php if ($r['payment_url']): ?>
                    <div class="mt-2 flex items-center gap-2">
                        <a href="<?= e($r['payment_url']) ?>" target="_blank" rel="noopener"
                           class="text-xs text-indigo-600 hover:text-indigo-800 font-medium truncate">
                            Payment link →
                        </a>
                        <span class="text-xs text-gray-400"><?= $r['link_status'] ? ucfirst(e($r['link_status'])) : '' ?></span>
                    </div>
                    <?php endif; ?>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>

        <!-- Payment history -->
        <?php if (!empty($payments)): ?>
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="font-semibold text-gray-900">Payment Links</h2>
            </div>
            <div class="divide-y divide-gray-100">
                <?php foreach ($payments as $pl): ?>
                <div class="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-sm text-gray-800 font-medium truncate"><?= e($pl['reference'] ?? '') ?></p>
                        <p class="text-xs text-gray-400"><?= date('d M Y H:i', strtotime($pl['created_at'])) ?></p>
                    </div>
                    <div class="flex items-center gap-3 flex-shrink-0">
                        <span class="text-sm font-medium text-gray-700">MUR <?= number_format((float)$pl['amount'], 0) ?></span>
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
                        <?php if ($pl['payment_url']): ?>
                        <a href="<?= e($pl['payment_url']) ?>" target="_blank" rel="noopener"
                           class="text-xs text-indigo-600 hover:text-indigo-800">Link →</a>
                        <?php endif; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>

        <?php if ($policy['notes']): ?>
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 class="font-semibold text-gray-900 mb-2">Notes</h2>
            <p class="text-sm text-gray-700 whitespace-pre-line"><?= e($policy['notes']) ?></p>
        </div>
        <?php endif; ?>
    </div>
</div>
