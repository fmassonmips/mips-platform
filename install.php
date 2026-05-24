<?php
/**
 * InsurLink MU — Install Wizard
 *
 * Run once at first deployment to:
 * 1. Verify environment requirements
 * 2. Test database connection
 * 3. Import schema + seed data
 * 4. Create admin user
 *
 * DELETE or password-protect this file after setup.
 */
declare(strict_types=1);

define('ROOT_PATH', __DIR__);
define('CONFIG_PATH', ROOT_PATH . '/config');

// ── Helpers ──────────────────────────────────────────────────────────────────

function e(mixed $v): string
{
    return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function checkReq(string $label, bool $ok, string $detail = ''): void
{
    $icon = $ok ? '✓' : '✗';
    $cls  = $ok ? 'text-green-700' : 'text-red-700';
    echo "<li class='flex items-start gap-2 {$cls}'>"
       . "<span class='font-bold mt-0.5'>{$icon}</span>"
       . "<div><strong>" . e($label) . "</strong>"
       . ($detail ? " <span class='text-sm opacity-70'>— " . e($detail) . "</span>" : '')
       . "</div></li>\n";
}

// ── Environment checks ────────────────────────────────────────────────────────

$phpOk    = PHP_VERSION_ID >= 80100;
$pdoOk    = extension_loaded('pdo') && extension_loaded('pdo_mysql');
$mbOk     = extension_loaded('mbstring');
$jsonOk   = extension_loaded('json');
$opensslOk= extension_loaded('openssl');
$configOk = is_file(CONFIG_PATH . '/config.php');

$allEnvOk = $phpOk && $pdoOk && $mbOk && $jsonOk && $opensslOk && $configOk;

$step     = 1;
$messages = [];
$errors   = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $allEnvOk) {
    $action = $_POST['action'] ?? '';

    // ── STEP 2: Test DB + import schema ─────────────────────────────────────
    if ($action === 'import_schema') {
        $config = require CONFIG_PATH . '/config.php';
        $cfg    = $config['db'];
        try {
            $pdo = new PDO(
                "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['name']};charset={$cfg['charset']}",
                $cfg['user'], $cfg['pass'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );
            $messages[] = '✓ Database connection successful.';

            $schemaFiles = ['schema.sql', 'seed.sql'];
            foreach ($schemaFiles as $file) {
                $path = ROOT_PATH . '/sql/' . $file;
                if (is_file($path)) {
                    $sql = file_get_contents($path);
                    // Split on ; + newline to execute statements individually
                    foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $stmt) {
                        if ($stmt !== '') {
                            try { $pdo->exec($stmt); } catch (PDOException $e) {
                                // Ignore duplicate key / table exists errors in seed
                                if (!str_contains($e->getMessage(), 'Duplicate entry') && !str_contains($e->getMessage(), 'already exists')) {
                                    $errors[] = "SQL error in {$file}: " . $e->getMessage();
                                }
                            }
                        }
                    }
                    $messages[] = "✓ {$file} imported.";
                } else {
                    $errors[] = "File not found: sql/{$file}";
                }
            }
            $step = count($errors) === 0 ? 3 : 2;
        } catch (PDOException $e) {
            $errors[] = 'Database connection failed: ' . $e->getMessage();
            $step = 2;
        }
    }

    // ── STEP 3: Create admin brokerage + user ────────────────────────────────
    if ($action === 'create_admin') {
        $config = require CONFIG_PATH . '/config.php';
        $cfg    = $config['db'];

        $brokerageName = trim($_POST['brokerage_name'] ?? '');
        $adminEmail    = trim($_POST['admin_email'] ?? '');
        $adminName     = trim($_POST['admin_name'] ?? '');
        $adminPassword = $_POST['admin_password'] ?? '';
        $adminPassword2= $_POST['admin_password2'] ?? '';

        if (!$brokerageName || !$adminEmail || !$adminName || !$adminPassword) {
            $errors[] = 'All fields are required.';
        } elseif (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Invalid email address.';
        } elseif ($adminPassword !== $adminPassword2) {
            $errors[] = 'Passwords do not match.';
        } elseif (strlen($adminPassword) < 8) {
            $errors[] = 'Password must be at least 8 characters.';
        } else {
            try {
                $pdo = new PDO(
                    "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['name']};charset={$cfg['charset']}",
                    $cfg['user'], $cfg['pass'],
                    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
                );

                // Create brokerage
                $pdo->prepare(
                    "INSERT IGNORE INTO brokerages (name, email, subscription_plan, subscription_status)
                     VALUES (?, ?, 'trial', 'trial')"
                )->execute([$brokerageName, $adminEmail]);

                $brkId = $pdo->lastInsertId();
                if (!$brkId) {
                    $row   = $pdo->query("SELECT id FROM brokerages WHERE name = " . $pdo->quote($brokerageName) . " LIMIT 1")->fetch(PDO::FETCH_ASSOC);
                    $brkId = $row['id'] ?? 0;
                }

                // Create user
                $hash = password_hash($adminPassword, PASSWORD_BCRYPT, ['cost' => 12]);
                $pdo->prepare(
                    "INSERT INTO users (email, password_hash, name, role, is_active) VALUES (?, ?, ?, 'admin', 1)
                     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), is_active = 1"
                )->execute([$adminEmail, $hash, $adminName]);

                $userId = $pdo->lastInsertId();
                if (!$userId) {
                    $row    = $pdo->query("SELECT id FROM users WHERE email = " . $pdo->quote($adminEmail) . " LIMIT 1")->fetch(PDO::FETCH_ASSOC);
                    $userId = $row['id'] ?? 0;
                }

                // Create agent record
                $pdo->prepare(
                    "INSERT IGNORE INTO agents (user_id, brokerage_id, role, is_active) VALUES (?, ?, 'admin', 1)"
                )->execute([$userId, $brkId]);

                $messages[] = "✓ Admin account created: {$adminEmail}";
                $messages[] = "✓ Brokerage: {$brokerageName}";
                $step = 4; // Done
            } catch (PDOException $e) {
                $errors[] = 'Error: ' . $e->getMessage();
                $step = 3;
            }
        }

        if ($errors) $step = 3;
    }
}
?>
<html lang="en" class="h-full bg-gray-50">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>InsurLink MU — Installation Wizard</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="h-full py-10 px-4">
<div class="max-w-2xl mx-auto">

    <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 bg-indigo-700 rounded-2xl mb-4">
            <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900">InsurLink MU — Installation</h1>
        <p class="text-gray-500 text-sm mt-1">Complete each step to set up your platform</p>
    </div>

    <?php if ($errors): ?>
    <div class="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg space-y-1">
        <?php foreach ($errors as $e): ?><p><?= e($e) ?></p><?php endforeach; ?>
    </div>
    <?php endif; ?>

    <?php if ($messages): ?>
    <div class="mb-5 px-4 py-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg space-y-1">
        <?php foreach ($messages as $m): ?><p><?= e($m) ?></p><?php endforeach; ?>
    </div>
    <?php endif; ?>

    <!-- Step 1: Requirements -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div class="px-6 py-4 border-b border-gray-100">
            <h2 class="font-semibold text-gray-900">Step 1 — System Requirements</h2>
        </div>
        <div class="px-6 py-5">
            <ul class="space-y-2">
                <?php
                checkReq('PHP 8.1+', $phpOk, 'Current: ' . PHP_VERSION);
                checkReq('PDO + PDO_MySQL', $pdoOk);
                checkReq('mbstring', $mbOk);
                checkReq('json', $jsonOk);
                checkReq('openssl', $opensslOk);
                checkReq('config/config.php exists', $configOk,
                    $configOk ? '' : 'Copy config.sample.php to config/config.php and fill in your DB details');
                ?>
            </ul>
            <?php if (!$allEnvOk): ?>
            <p class="mt-4 text-sm text-red-600 font-medium">Fix the issues above before continuing.</p>
            <?php endif; ?>
        </div>
    </div>

    <?php if ($allEnvOk && $step <= 2): ?>
    <!-- Step 2: Import schema -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div class="px-6 py-4 border-b border-gray-100">
            <h2 class="font-semibold text-gray-900">Step 2 — Import Database Schema</h2>
        </div>
        <div class="px-6 py-5">
            <p class="text-sm text-gray-600 mb-4">
                This will import <code class="bg-gray-100 px-1 rounded text-xs">sql/schema.sql</code> and
                <code class="bg-gray-100 px-1 rounded text-xs">sql/seed.sql</code> into your database.
                Existing data will not be overwritten (uses CREATE TABLE IF NOT EXISTS + INSERT IGNORE).
            </p>
            <form method="POST">
                <input type="hidden" name="action" value="import_schema">
                <button type="submit"
                        class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                    Import Schema &amp; Seed Data
                </button>
            </form>
        </div>
    </div>
    <?php endif; ?>

    <?php if ($step === 3): ?>
    <!-- Step 3: Create admin -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
        <div class="px-6 py-4 border-b border-gray-100">
            <h2 class="font-semibold text-gray-900">Step 3 — Create Admin Account</h2>
        </div>
        <div class="px-6 py-5">
            <form method="POST" class="space-y-4">
                <input type="hidden" name="action" value="create_admin">
                <?php foreach ([
                    ['brokerage_name', 'Brokerage Name', 'text', 'e.g. Alpha Insurance Brokers'],
                    ['admin_name', 'Admin Full Name', 'text', 'e.g. Jean Dupont'],
                    ['admin_email', 'Admin Email', 'email', 'admin@yourbrokerage.mu'],
                    ['admin_password', 'Password', 'password', 'Min 8 characters'],
                    ['admin_password2', 'Confirm Password', 'password', ''],
                ] as [$name, $label, $type, $placeholder]): ?>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1"><?= e($label) ?></label>
                    <input type="<?= $type ?>" name="<?= $name ?>" required
                           placeholder="<?= e($placeholder) ?>"
                           value="<?= $type !== 'password' ? e($_POST[$name] ?? '') : '' ?>"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
                <?php endforeach; ?>
                <button type="submit"
                        class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors">
                    Create Admin Account
                </button>
            </form>
        </div>
    </div>
    <?php endif; ?>

    <?php if ($step === 4): ?>
    <!-- Done -->
    <div class="bg-white rounded-xl border border-green-300 shadow-sm p-8 text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-4">
            <svg class="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Installation Complete!</h2>
        <p class="text-gray-600 text-sm mb-6">
            Your InsurLink MU platform is ready to use.
            <strong class="text-red-600">Delete or rename <code>install.php</code> now</strong>
            to prevent unauthorized re-installation.
        </p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/"
               class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors">
                Go to Login
            </a>
        </div>
    </div>
    <?php endif; ?>

</div>
</body>
</html>
