<?php
/**
 * Tiny CLI helper to generate a bcrypt hash suitable for sql/seed.sql.
 *
 * Usage:
 *     php tools/make_password_hash.php 'MyStrongPassword!'
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script must be run from the CLI.\n");
    exit(1);
}

$password = $argv[1] ?? null;
if ($password === null || $password === '') {
    fwrite(STDERR, "Usage: php tools/make_password_hash.php '<password>'\n");
    exit(1);
}

echo password_hash($password, PASSWORD_DEFAULT), PHP_EOL;
