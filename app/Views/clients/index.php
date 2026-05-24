<?php $pageTitle = 'Clients'; ?>

<div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Clients</h1>
    <a href="/clients/create"
       class="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
        <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        New Client
    </a>
</div>

<!-- Search -->
<form method="GET" action="/clients" class="mb-5">
    <div class="flex gap-2">
        <input type="text" name="q" value="<?= e($search) ?>" placeholder="Search by name, email or phone…"
               class="flex-1 px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <button type="submit"
                class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors">
            Search
        </button>
        <?php if ($search): ?>
        <a href="/clients" class="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm rounded-lg transition-colors">Clear</a>
        <?php endif; ?>
    </div>
</form>

<div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <?php if (empty($clients)): ?>
    <div class="px-6 py-16 text-center">
        <svg class="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <p class="text-gray-500 text-sm"><?= $search ? 'No clients match your search.' : 'No clients yet. Add your first client.' ?></p>
        <?php if (!$search): ?>
        <a href="/clients/create" class="mt-3 inline-block text-indigo-600 hover:text-indigo-800 text-sm font-medium">Add a client →</a>
        <?php endif; ?>
    </div>
    <?php else: ?>
    <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Agent</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Added</th>
                    <th class="px-5 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                <?php foreach ($clients as $c): ?>
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-3.5">
                        <div class="flex items-center">
                            <div class="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0">
                                <?= strtoupper(substr($c['first_name'], 0, 1) . substr($c['last_name'], 0, 1)) ?>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-900">
                                    <?= e($c['first_name'] . ' ' . $c['last_name']) ?>
                                </p>
                                <p class="text-xs text-gray-500"><?= e($c['email'] ?? '') ?></p>
                            </div>
                        </div>
                    </td>
                    <td class="px-5 py-3.5 text-sm text-gray-600 hidden sm:table-cell">
                        <?= e($c['phone_mobile'] ?? '') ?>
                    </td>
                    <td class="px-5 py-3.5 text-sm text-gray-500 hidden md:table-cell">
                        <?= e($c['agent_name'] ?? '—') ?>
                    </td>
                    <td class="px-5 py-3.5 text-sm text-gray-400 hidden lg:table-cell">
                        <?= date('d M Y', strtotime($c['created_at'])) ?>
                    </td>
                    <td class="px-5 py-3.5 text-right">
                        <a href="/clients/<?= (int)$c['id'] ?>"
                           class="text-sm text-indigo-600 hover:text-indigo-800 font-medium">View</a>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
        Showing <?= count($clients) ?> client<?= count($clients) !== 1 ? 's' : '' ?>
    </div>
    <?php endif; ?>
</div>
