<?php $pageTitle = $is_edit ? 'Edit Client' : 'New Client'; ?>

<div class="max-w-2xl">
    <div class="flex items-center gap-3 mb-6">
        <a href="<?= $is_edit ? '/clients/' . (int)($client['id'] ?? 0) : '/clients' ?>"
           class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
        </a>
        <h1 class="text-2xl font-bold text-gray-900"><?= $is_edit ? 'Edit Client' : 'New Client' ?></h1>
    </div>

    <form method="POST" action="<?= $is_edit ? '/clients/' . (int)($client['id'] ?? 0) : '/clients' ?>"
          class="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">

        <input type="hidden" name="csrf_token" value="<?= e($csrf) ?>">

        <!-- Personal info -->
        <div class="px-6 py-5">
            <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Personal Information</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <?php foreach ([['first_name', 'First Name', 'text', true], ['last_name', 'Last Name', 'text', true],
                                ['email', 'Email Address', 'email', false], ['phone_mobile', 'Mobile Phone', 'tel', true],
                                ['phone_whatsapp', 'WhatsApp Number', 'tel', false], ['nic_number', 'NIC Number', 'text', false]] as [$name, $label, $type, $req]):
                    $err = $errors[$name] ?? null;
                ?>
                <div>
                    <label for="<?= $name ?>" class="block text-sm font-medium text-gray-700 mb-1">
                        <?= e($label) ?><?= $req ? ' <span class="text-red-500">*</span>' : '' ?>
                    </label>
                    <input type="<?= $type ?>" id="<?= $name ?>" name="<?= $name ?>"
                           value="<?= e((string)($client[$name] ?? '')) ?>"
                           class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                                  <?= $err ? 'border-red-400 bg-red-50' : 'border-gray-300' ?>">
                    <?php if ($err): ?>
                    <p class="mt-1 text-xs text-red-600"><?= e($err) ?></p>
                    <?php endif; ?>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- Preferences -->
        <div class="px-6 py-5">
            <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Preferences</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Client Type</label>
                    <select name="client_type" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="individual" <?= ($client['client_type'] ?? 'individual') === 'individual' ? 'selected' : '' ?>>Individual</option>
                        <option value="company" <?= ($client['client_type'] ?? '') === 'company' ? 'selected' : '' ?>>Company</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Language</label>
                    <select name="language_pref" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="en" <?= ($client['language_pref'] ?? 'en') === 'en' ? 'selected' : '' ?>>English</option>
                        <option value="fr" <?= ($client['language_pref'] ?? '') === 'fr' ? 'selected' : '' ?>>Français</option>
                    </select>
                </div>
                <?php if (!empty($agents)): ?>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Assigned Agent</label>
                    <select name="agent_id" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <?php foreach ($agents as $ag): ?>
                        <option value="<?= (int)$ag['id'] ?>" <?= ((int)($client['agent_id'] ?? 0)) === (int)$ag['id'] ? 'selected' : '' ?>>
                            <?= e($ag['name']) ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <?php endif; ?>
            </div>
            <div class="mt-4">
                <p class="text-sm font-medium text-gray-700 mb-2">Contact Preference</p>
                <div class="flex gap-4">
                    <?php
                    $prefs = [];
                    if (!empty($client['communication_pref'])) {
                        $prefs = is_array($client['communication_pref'])
                            ? $client['communication_pref']
                            : (json_decode($client['communication_pref'], true) ?? []);
                    }
                    ?>
                    <label class="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name="pref_email" value="1"
                               <?= !empty($prefs['email']) ? 'checked' : '' ?>
                               class="rounded border-gray-300 text-indigo-600">
                        Email
                    </label>
                    <label class="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name="pref_whatsapp" value="1"
                               <?= !empty($prefs['whatsapp']) ? 'checked' : '' ?>
                               class="rounded border-gray-300 text-indigo-600">
                        WhatsApp
                    </label>
                </div>
            </div>
        </div>

        <!-- Notes -->
        <div class="px-6 py-5">
            <label for="notes" class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea id="notes" name="notes" rows="3"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      placeholder="Optional internal notes…"><?= e((string)($client['notes'] ?? '')) ?></textarea>
        </div>

        <!-- Actions -->
        <div class="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3 rounded-b-xl">
            <a href="<?= $is_edit ? '/clients/' . (int)($client['id'] ?? 0) : '/clients' ?>"
               class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
                Cancel
            </a>
            <button type="submit"
                    class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                <?= $is_edit ? 'Save Changes' : 'Create Client' ?>
            </button>
        </div>
    </form>
</div>
