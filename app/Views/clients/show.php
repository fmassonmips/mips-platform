<?php $pageTitle = $client['first_name'] . ' ' . $client['last_name']; ?>

<div class="flex items-center gap-3 mb-6">
    <a href="/clients" class="text-gray-400 hover:text-gray-600 transition-colors">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
    </a>
    <h1 class="text-2xl font-bold text-gray-900">
        <?= e($client['first_name'] . ' ' . $client['last_name']) ?>
    </h1>
    <a href="/clients/<?= (int)$client['id'] ?>/edit"
       class="ml-auto px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors">
        Edit
    </a>
    <a href="/policies/create?client_id=<?= (int)$client['id'] ?>"
       class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
        + Add Policy
    </a>
</div>

<div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <!-- Client details -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Contact Details</h2>
        <dl class="space-y-3">
            <?php foreach ([
                ['Email', $client['email'] ?? ''],
                ['Mobile', $client['phone_mobile'] ?? ''],
                ['WhatsApp', $client['phone_whatsapp'] ?? ''],
                ['NIC', $client['nic_number'] ?? ''],
                ['Type', ucfirst($client['client_type'] ?? '')],
                ['Language', strtoupper($client['language_pref'] ?? 'EN')],
            ] as [$k, $v]): if (!$v) continue; ?>
            <div>
                <dt class="text-xs text-gray-400 font-medium"><?= e($k) ?></dt>
                <dd class="text-sm text-gray-900 mt-0.5"><?= e($v) ?></dd>
            </div>
            <?php endforeach; ?>
        </dl>

        <?php if ($client['notes']): ?>
        <div class="mt-5 pt-5 border-t border-gray-100">
            <p class="text-xs text-gray-400 font-medium mb-1">Notes</p>
            <p class="text-sm text-gray-700 whitespace-pre-line"><?= e($client['notes']) ?></p>
        </div>
        <?php endif; ?>
    </div>

    <!-- Policies -->
    <div class="xl:col-span-2 space-y-6">
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 class="font-semibold text-gray-900">Policies (<?= count($policies) ?>)</h2>
                <a href="/policies/create?client_id=<?= (int)$client['id'] ?>"
                   class="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ New policy</a>
            </div>
            <?php if (empty($policies)): ?>
            <div class="px-5 py-10 text-center text-gray-400 text-sm">No policies yet.</div>
            <?php else: ?>
            <div class="divide-y divide-gray-100">
                <?php foreach ($policies as $p): ?>
                <a href="/policies/<?= (int)$p['id'] ?>"
                   class="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div>
                        <p class="text-sm font-medium text-gray-900">
                            <?= e($p['insurer_name'] ?? '') ?>
                            <?php if ($p['product_name']): ?> &mdash; <?= e($p['product_name']) ?><?php endif; ?>
                        </p>
                        <p class="text-xs text-gray-500 mt-0.5">
                            <?= e($p['policy_number'] ?: $p['internal_ref'] ?? '') ?>
                            &bull; <?= date('d M Y', strtotime($p['end_date'])) ?>
                        </p>
                    </div>
                    <div class="flex items-center gap-3">
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
                        <span class="text-sm font-semibold text-gray-700">
                            MUR <?= number_format((float)$p['premium_amount'], 0) ?>
                        </span>
                    </div>
                </a>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>

        <!-- Recent communications -->
        <?php if (!empty($comms)): ?>
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="font-semibold text-gray-900">Recent Communications</h2>
            </div>
            <div class="divide-y divide-gray-100">
                <?php foreach ($comms as $comm): ?>
                <div class="px-5 py-3.5">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-medium text-gray-500 uppercase"><?= e($comm['channel'] ?? '') ?></span>
                        <span class="text-xs text-gray-400"><?= date('d M Y H:i', strtotime($comm['created_at'])) ?></span>
                        <span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"><?= e($comm['status'] ?? '') ?></span>
                    </div>
                    <p class="text-sm text-gray-700 truncate"><?= e($comm['subject'] ?? $comm['template_slug'] ?? '') ?></p>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>
</div>
