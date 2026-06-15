<?php
/**
 * PHPUnit bootstrap. Uses Composer's PSR-4 autoloader (App\ -> src/, Tests\ ->
 * tests/) and loads the application config so services that read
 * $GLOBALS['config'] behave exactly as they do at runtime.
 *
 * Integration tests connect to the database described by the DB_* env vars and
 * skip themselves when no database is reachable, so the unit suite always runs.
 */
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

$GLOBALS['config'] = require __DIR__ . '/../config/config.php';
