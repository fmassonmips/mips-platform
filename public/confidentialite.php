<?php
/**
 * Privacy policy (public). Version: App\Legal::VERSION.
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$doc        = 'confidentialite';
$page_title = 'Politique de confidentialité';
require TEMPLATES_PATH . '/legal.view.php';
