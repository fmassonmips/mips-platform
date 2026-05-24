<?php $pageTitle = 'Dashboard'; ?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
    <p class="text-gray-500 text-sm mt-1">Good morning, <?= e($_SESSION['agent']['name'] ?? 'Agent') ?></p>
</div>

<!-- KPI Cards -->
<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div class="flex items-center justify-between">
            <div>
                <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Policies</p>
                <p class="mt-1 text-3xl font-bold text-gray-900"><?= number_format((int)$activeCount) ?></p>
            </div>
            <div class="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
        </div>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div class="flex items-center justify-between">
            <div>
                <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Expiring in 30 days</p>
                <p class="mt-1 text-3xl font-bold <?= count($due30) > 0 ? 'text-amber-600' : 'text-gray-900' ?>">
                    <?= count($due30) ?>
                </p>
            </div>
            <div class="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
            </div>
        </div>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div class="flex items-center justify-between">
            <div>
                <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue at Risk (45d)</p>
                <p class="mt-1 text-3xl font-bold text-red-600">
                    MUR <?= number_format((float)$revenueAtRisk, 0) ?>
                </p>
            </div>
            <div class="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
        </div>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div class="flex items-center justify-between">
            <div>
                <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Payments</p>
                <p class="mt-1 text-3xl font-bold <?= (int)$pendingPayments > 0 ? 'text-orange-600' : 'text-gray-900' ?>">
                    <?= number_format((int)$pendingPayments) ?>
                </p>
            </div>
            <div class="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                </svg>
            </div>
        </div>
    </div>
</div>

<div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <!-- Expiring Soon -->
    <div class="xl:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 class="font-semibold text-gray-900">Expiring within 30 days</h2>
            <a href="/renewals" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View all renewals →</a>
        </div>
        <?php if (empty($due30)): ?>
        <div class="px-5 py-10 text-center text-gray-400 text-sm">No policies expiring in the next 30 days.</div>
        <?php else: ?>
        <div class="divide-y divide-gray-100">
            <?php foreach ($due30 as $p): ?>
            <div class="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">
                        <?= e($p['first_name'] . ' ' . $p['last_name']) ?>
                    </p>
                    <p class="text-xs text-gray-500 truncate">
                        <?= e($p['insurer_name'] ?? '') ?> &bull; <?= e($p['policy_number'] ?: 'No ref') ?>
                    </p>
                </div>
                <div class="ml-4 flex-shrink-0 text-right">
                    <p class="text-sm font-semibold text-gray-900">
                        <?= date('d M Y', strtotime($p['end_date'])) ?>
                    </p>
                    <p class="text-xs text-gray-500">
                        MUR <?= number_format((float)$p['premium_amount'], 0) ?>
                    </p>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>

    <!-- Sidebar panels -->
    <div class="space-y-6">
        <!-- Renewal pipeline -->
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="font-semibold text-gray-900">Renewal Pipeline <?= date('Y') ?></h2>
            </div>
            <div class="p-5 space-y-3">
                <?php
                $statuses = ['pending' => ['label' => 'Pending', 'color' => 'text-gray-600 bg-gray-100'],
                             'contacted' => ['label' => 'Contacted', 'color' => 'text-blue-700 bg-blue-50'],
                             'in_progress' => ['label' => 'In Progress', 'color' => 'text-amber-700 bg-amber-50'],
                             'paid' => ['label' => 'Paid', 'color' => 'text-green-700 bg-green-50']];
                foreach ($statuses as $key => $meta):
                    $row = $pipelineMap[$key] ?? null;
                ?>
                <div class="flex items-center justify-between">
                    <span class="text-xs font-medium px-2 py-1 rounded-full <?= $meta['color'] ?>">
                        <?= $meta['label'] ?>
                    </span>
                    <div class="text-right">
                        <span class="text-sm font-semibold text-gray-900"><?= $row ? number_format((int)$row['cnt']) : '0' ?></span>
                        <?php if ($row && $row['total'] > 0): ?>
                        <span class="text-xs text-gray-400 ml-1">/ MUR <?= number_format((float)$row['total'], 0) ?></span>
                        <?php endif; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- Recent clients -->
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 class="font-semibold text-gray-900">Recent Clients</h2>
                <a href="/clients/create" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ New</a>
            </div>
            <?php if (empty($recentClients)): ?>
            <div class="px-5 py-8 text-center text-gray-400 text-sm">No clients yet.</div>
            <?php else: ?>
            <div class="divide-y divide-gray-100">
                <?php foreach ($recentClients as $c): ?>
                <a href="/clients/<?= (int)$c['id'] ?>"
                   class="flex items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div class="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0">
                        <?= strtoupper(substr($c['first_name'], 0, 1) . substr($c['last_name'], 0, 1)) ?>
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-gray-900 truncate">
                            <?= e($c['first_name'] . ' ' . $c['last_name']) ?>
                        </p>
                        <p class="text-xs text-gray-400 truncate"><?= e($c['email'] ?? '') ?></p>
                    </div>
                </a>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>
