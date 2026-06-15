<?php
/**
 * Thin request helpers shared by API controllers, matching the conventions
 * established by the auth controllers (POST-only, CSRF header, JSON body with a
 * form-encoded fallback for curl testing).
 */
declare(strict_types=1);

namespace App\Support;

use App\Csrf;
use App\Response;

final class Http
{
    public static function requireMethod(string $method): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
            Response::json(['error' => 'Method Not Allowed'], 405);
        }
    }

    /** Verify the CSRF synchronizer token sent via the X-CSRF-Token header. */
    public static function requireCsrf(): void
    {
        if (!Csrf::verify($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
            Response::json(['error' => 'Invalid CSRF token.'], 419);
        }
    }

    /** @return array<string,mixed> */
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

    public static function string(array $data, string $key): string
    {
        return is_string($data[$key] ?? null) ? trim((string) $data[$key]) : '';
    }

    public static function int(array $data, string $key): ?int
    {
        $v = $data[$key] ?? null;
        return is_numeric($v) ? (int) $v : null;
    }
}
