<?php
/**
 * Router for PHP's built-in server, test use only:
 *   APP_PUBLIC=/path/to/app/public php -S 127.0.0.1:8099 tests/router.php
 * Maps /api/x to /api/x.php (as the production rewrite does) and serves static files.
 */
$public = rtrim((string) getenv('APP_PUBLIC'), '/');
$uri    = (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file   = $public . $uri;
if (str_starts_with($uri, '/api/') && !str_ends_with($uri, '.php')) {
    $file .= '.php';
}
if (str_contains($uri, '..')) {
    http_response_code(400);
    return true;
}
if (is_file($file) && str_ends_with($file, '.php')) {
    $_SERVER['SCRIPT_NAME'] = $uri;
    chdir(dirname($file));
    require $file;
    return true;
}
if (is_file($file)) {
    $types = ['css' => 'text/css', 'js' => 'application/javascript', 'png' => 'image/png', 'svg' => 'image/svg+xml'];
    header('Content-Type: ' . ($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
    readfile($file);
    return true;
}
http_response_code(404);
return true;
