<?php
/**
 * Request helpers shared by API controllers.
 */
declare(strict_types=1);

namespace App;

final class Request
{
    /** Emit 405 unless the request uses the given method. */
    public static function require_method(string $method): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
    }

    /** Emit 419 unless the X-CSRF-Token header matches the session token. */
    public static function require_csrf(): void
    {
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }
    }

    /**
     * Parse the JSON body; fall back to form-encoded POST.
     *
     * @return array<string,mixed>
     */
    public static function body(): array
    {
        $data = json_decode((string) file_get_contents('php://input'), true);
        return is_array($data) ? $data : $_POST;
    }

    public static function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    /** Validate a YYYY-MM period string. */
    public static function period(mixed $value): ?string
    {
        if (!is_string($value) || !preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $value)) {
            return null;
        }
        return $value;
    }
}
