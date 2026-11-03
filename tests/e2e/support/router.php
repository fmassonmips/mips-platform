<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = $_SERVER['DOCUMENT_ROOT'];
if (str_starts_with($path, '/api/') && !str_ends_with($path, '.php') && is_file($root . $path . '.php')) {
    $_SERVER['SCRIPT_NAME'] = $path . '.php';
    require $root . $path . '.php';
    return true;
}
return false;
