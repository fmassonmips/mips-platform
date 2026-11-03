<?php
/**
 * Print a fresh application key for config security.app_key.
 *   php tools/make_app_key.php
 */
declare(strict_types=1);

echo base64_encode(random_bytes(32)), PHP_EOL;
