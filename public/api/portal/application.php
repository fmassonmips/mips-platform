<?php
declare(strict_types=1);

define('PORTAL', true);
require __DIR__ . '/../../../src/bootstrap.php';

(new \App\Controllers\Portal\PortalOnboardingController())->application();
