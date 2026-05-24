<?php $pageTitle = 'Renewals'; ?>

<div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Renewal Pipeline</h1>
</div>

<!-- Status filters -->
<div class="flex flex-wrap gap-2 mb-5">
    <?php foreach (['' => 'All', 'pending' => 'Pending', 'contacted' => 'Contacted', 'in_progress' => 'In Progress', 'paid' => 'Paid', 'lapsed' => 'Lapsed'] as $val => $label): ?>
    <a href="/renewals<?= $val ? '?status=' . $val : '' ?>"
       class="px-3 py-1.5 text-sm font-medium rounded-full transition-colors
              <?= $statusFilter === $val ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600' ?>">
        <?= e($label) ?>
    </a>
    <?php endforeach; ?>
</div>

<div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <?php if (empty($renewals)): ?>
    <div class="px-6 py-16 text-center">
        <svg class="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        <p class="text-gray-500 text-sm">No renewals found.</p>
        <p class="text-gray-400 text-xs mt-1">Renewals are auto-created when a policy is set to active.</p>
    </div>
    <?php else: ?>
    <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Insurer</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Expiry</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Premium</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden lg:table-cell">Payment</th>
                    <th class="px-5 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                <?php foreach ($renewals as $r):
                    $daysLeft = (int) floor((strtotime($r['end_date']) - strtotime($today)) / 86400);
                    $urgency  = $daysLeft < 0 ? 'text-red-600 font-semibold' : ($daysLeft <= 15 ? 'text-red-500 font-medium' : ($daysLeft <= 30 ? 'text-amber-600 font-medium' : 'text-gray-600'));
                ?>
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-3.5">
                        <p class="text-sm font-medium text-gray-900">
                            <?= e($r['first_name'] . ' ' . $r['last_name']) ?>
                        </p>
                        <p class="text-xs text-gray-400"><?= e($r['policy_number'] ?: '—') ?></p>
                    </td>
                    <td class="px-5 py-3.5 text-sm text-gray-700 hidden sm:table-cell">
                        <?= e($r['insurer_name'] ?? '') ?>
                    </td>
                    <td class="px-5 py-3.5 text-sm <?= $urgency ?>">
                        <?= date('d M Y', strtotime($r['end_date'])) ?>
                        <span class="text-xs ml-1">(<?= $daysLeft >= 0 ? $daysLeft . 'd' : 'expired' ?>)</span>
                    </td>
                    <td class="px-5 py-3.5 text-sm font-medium text-gray-700 hidden md:table-cell">
                        MUR <?= number_format((float)$r['premium_amount'], 0) ?>
                    </td>
                    <td class="px-5 py-3.5">
                        <span class="text-xs font-medium px-2 py-0.5 rounded-full
                            <?php echo match ($r['status'] ?? '') {
                                'paid'        => 'bg-green-100 text-green-700',
                                'contacted'   => 'bg-blue-100 text-blue-700',
                                'in_progress' => 'bg-amber-100 text-amber-700',
                                'lapsed'      => 'bg-red-100 text-red-700',
                                'cancelled'   => 'bg-red-100 text-red-600',
                                default       => 'bg-gray-100 text-gray-600',
                            }; ?>">
                            <?= ucfirst(str_replace('_', ' ', e($r['status'] ?? ''))) ?>
                        </span>
                    </td>
                    <td class="px-5 py-3.5 hidden lg:table-cell">
                        <?php if ($r['payment_url']): ?>
                        <a href="<?= e($r['payment_url']) ?>" target="_blank" rel="noopener"
                           class="text-xs text-indigo-600 hover:text-indigo-800">
                            Link <?= $r['link_status'] ? '(' . e($r['link_status']) . ')' : '' ?> →
                        </a>
                        <?php else: ?>
                        <span class="text-xs text-gray-400">No link</span>
                        <?php endif; ?>
                    </td>
                    <td class="px-5 py-3.5">
                        <?php if (($r['status'] ?? '') !== 'paid'): ?>
                        <div x-data="{ open: false }" class="relative">
                            <button @click="open=!open"
                                    class="text-sm text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap">
                                Send →
                            </button>
                            <div x-show="open" x-cloak @click.away="open=false"
                                 class="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10 py-1">
                                <?php foreach (['email' => 'Send Email', 'whatsapp' => 'Send WhatsApp'] as $ch => $label): ?>
                                <form method="POST" action="/renewals/<?= (int)$r['id'] ?>/send">
                                    <input type="hidden" name="csrf_token" value="<?= e(\App\Csrf::token()) ?>">
                                    <input type="hidden" name="channel" value="<?= $ch ?>">
                                    <button type="submit"
                                            class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                        <?= $label ?>
                                    </button>
                                </form>
                                <?php endforeach; ?>
                            </div>
                        </div>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
        Showing <?= count($renewals) ?> renewal<?= count($renewals) !== 1 ? 's' : '' ?>
    </div>
    <?php endif; ?>
</div>
