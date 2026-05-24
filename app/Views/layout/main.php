<!DOCTYPE html>
<html lang="en" class="h-full bg-gray-50">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= isset($pageTitle) ? e($pageTitle) . ' — ' : '' ?>InsurLink MU</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <style>[x-cloak]{display:none!important}</style>
</head>
<body class="h-full" x-data="{ sidebarOpen: false }">

<!-- Mobile overlay -->
<div x-show="sidebarOpen" x-cloak class="fixed inset-0 z-40 bg-gray-600/75 lg:hidden"
     @click="sidebarOpen=false"></div>

<!-- Sidebar -->
<div class="fixed inset-y-0 left-0 z-50 w-64 bg-indigo-900 flex flex-col transition-transform duration-200"
     :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'">

    <div class="flex items-center h-16 px-6 bg-indigo-950 flex-shrink-0">
        <svg class="w-7 h-7 text-indigo-300 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
        </svg>
        <span class="text-white font-bold text-lg tracking-tight">InsurLink MU</span>
    </div>

    <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <?php
        $navItems = [
            ['href' => '/',         'label' => 'Dashboard',  'icon' => 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'],
            ['href' => '/clients',  'label' => 'Clients',    'icon' => 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'],
            ['href' => '/policies', 'label' => 'Policies',   'icon' => 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'],
            ['href' => '/renewals', 'label' => 'Renewals',   'icon' => 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'],
            ['href' => '/payments', 'label' => 'Payments',   'icon' => 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z'],
        ];
        $currentPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        foreach ($navItems as $item):
            $active = ($currentPath === $item['href'])
                   || ($item['href'] !== '/' && str_starts_with($currentPath, $item['href']));
        ?>
        <a href="<?= $item['href'] ?>"
           class="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg group transition-colors
                  <?= $active ? 'bg-indigo-700 text-white' : 'text-indigo-200 hover:bg-indigo-800 hover:text-white' ?>">
            <svg class="w-5 h-5 mr-3 flex-shrink-0 <?= $active ? 'text-white' : 'text-indigo-400 group-hover:text-white' ?>"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?= $item['icon'] ?>"/>
            </svg>
            <?= e($item['label']) ?>
        </a>
        <?php endforeach; ?>
    </nav>

    <div class="flex-shrink-0 p-4 border-t border-indigo-800">
        <div class="text-xs text-indigo-400 truncate mb-1">
            <?= e($_SESSION['agent']['brokerage_name'] ?? 'Brokerage') ?>
        </div>
        <div class="text-sm text-indigo-200 font-medium truncate">
            <?= e($_SESSION['agent']['name'] ?? 'Agent') ?>
        </div>
        <div class="text-xs text-indigo-400 truncate">
            <?= e($_SESSION['agent']['role'] ?? '') ?>
        </div>
        <a href="/logout" class="mt-3 flex items-center text-xs text-indigo-400 hover:text-white transition-colors">
            <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Sign out
        </a>
    </div>
</div>

<!-- Main area -->
<div class="lg:pl-64 flex flex-col min-h-screen">
    <!-- Top bar (mobile) -->
    <div class="sticky top-0 z-30 bg-white border-b border-gray-200 flex items-center h-14 px-4 lg:hidden">
        <button @click="sidebarOpen=true" class="text-gray-500 hover:text-gray-700">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
        </button>
        <span class="ml-4 font-semibold text-gray-800">InsurLink MU</span>
    </div>

    <!-- Flash messages -->
    <?php $flash = \App\View::getFlash(); if ($flash): ?>
    <div x-data="{ show: true }" x-show="show" x-cloak
         class="mx-4 mt-4 px-4 py-3 rounded-lg flex items-start justify-between gap-3
                <?= $flash['type'] === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800' ?>">
        <span class="text-sm"><?= e($flash['message']) ?></span>
        <button @click="show=false" class="flex-shrink-0 text-current opacity-60 hover:opacity-100">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
        </button>
    </div>
    <?php endif; ?>

    <!-- Page content -->
    <main class="flex-1 p-4 lg:p-8">
        <?= $content ?>
    </main>

    <footer class="text-center text-xs text-gray-400 py-4 border-t border-gray-100">
        InsurLink MU &copy; <?= date('Y') ?>
    </footer>
</div>

</body>
</html>
