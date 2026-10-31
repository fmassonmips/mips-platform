<?php
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../src/bootstrap.php';

header('Location: ' . (\App\Portal\PortalAuth::current() !== null ? '/portal/home.php' : '/portal/login.php'));
exit;
