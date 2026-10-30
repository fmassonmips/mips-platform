<?php
/**
 * Terms of use (public). Version: App\Legal::VERSION.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$doc        = 'cgu';
$page_title = 'Conditions générales d’utilisation';
require TEMPLATES_PATH . '/legal.view.php';
