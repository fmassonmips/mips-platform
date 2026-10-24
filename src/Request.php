<?php
/**
 * Request helpers for JSON API endpoints.
 */
declare(strict_types=1);

namespace App;

final class Request
{
    /**
     * Decoded JSON body, or an empty array when absent or malformed.
     *
     * @return array<string,mixed>
     */
    public static function json(): array
    {
        $data = json_decode((string) file_get_contents('php://input'), true);
        return is_array($data) ? $data : [];
    }

    /**
     * @param array<string,mixed> $data
     */
    public static function str(array $data, string $key, int $maxLen = 500): string
    {
        $value = is_string($data[$key] ?? null) || is_numeric($data[$key] ?? null) ? trim((string) $data[$key]) : '';
        return mb_substr($value, 0, $maxLen);
    }

    /**
     * @param array<string,mixed> $data
     */
    public static function int(array $data, string $key): int
    {
        $value = $data[$key] ?? null;
        return is_int($value) || (is_string($value) && ctype_digit($value)) ? (int) $value : 0;
    }
}
