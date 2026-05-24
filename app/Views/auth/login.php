<!DOCTYPE html>
<html lang="en" class="h-full bg-indigo-950">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In — InsurLink MU</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="h-full flex items-center justify-center">

<div class="w-full max-w-md px-6">
    <!-- Logo -->
    <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 bg-indigo-700 rounded-2xl mb-4">
            <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">InsurLink MU</h1>
        <p class="text-indigo-300 text-sm mt-1">Broker Management Platform</p>
    </div>

    <!-- Card -->
    <div class="bg-white rounded-2xl shadow-2xl px-8 py-10">
        <h2 class="text-xl font-semibold text-gray-900 mb-6">Sign in to your account</h2>

        <?php if (!empty($error)): ?>
        <div class="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            <?= e($error) ?>
        </div>
        <?php endif; ?>

        <form method="POST" action="/login" novalidate>
            <input type="hidden" name="csrf_token" value="<?= e($csrf) ?>">

            <div class="mb-4">
                <label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input type="email" id="email" name="email" required autocomplete="username"
                       value="<?= e($_POST['email'] ?? '') ?>"
                       class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                              placeholder-gray-400"
                       placeholder="agent@brokerage.mu">
            </div>

            <div class="mb-6">
                <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" id="password" name="password" required autocomplete="current-password"
                       class="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
            </div>

            <button type="submit"
                    class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4
                           rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                Sign in
            </button>
        </form>
    </div>

    <p class="text-center text-xs text-indigo-400 mt-6">
        Mauritius Insurance Broker Platform &bull; Protected system
    </p>
</div>

</body>
</html>
