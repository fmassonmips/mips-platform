<?php
declare(strict_types=1);

require __DIR__ . '/../../../src/bootstrap.php';

(new \App\Controllers\StaffZen\LeaveController())->handle();
