<?php
/**
 * Small request helper for the JSON CRUD endpoints.
 *
 * Centralises method detection, JSON body parsing and CSRF enforcement so the
 * resource controllers stay focused on their data logic.
 */
declare(strict_types=1);

namespace App;

final class Request
{
    public static function method(): string
    {
        return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    }

    /**
     * Decode the JSON request body (falls back to form-encoded POST data).
     *
     * @return array<string,mixed>
     */
    public static function jsonBody(): array
    {
        $raw  = (string) file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = $_POST;
        }
        /** @var array<string,mixed> $data */
        return $data;
    }

    /**
     * Read a positive integer from the query string, or null if absent/invalid.
     */
    public static function queryInt(string $key): ?int
    {
        $val = $_GET[$key] ?? null;
        if ($val === null || !is_string($val) || !ctype_digit($val)) {
            return null;
        }
        $n = (int) $val;
        return $n > 0 ? $n : null;
    }

    public static function queryString(string $key): ?string
    {
        $val = $_GET[$key] ?? null;
        return is_string($val) && $val !== '' ? $val : null;
    }

    /**
     * Verify the CSRF token sent via the X-CSRF-Token header.
     * Terminates with 419 when it is missing or invalid.
     */
    public static function requireCsrf(): void
    {
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }
    }
}
