<?php
/**
 * Tiny JSON response helper. All API endpoints should exit through this.
 */
declare(strict_types=1);

namespace App;

final class Response
{
    /**
     * Emit a JSON response and terminate the request.
     *
     * @param array<string,mixed> $data
     */
    public static function json(array $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(
            $data,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        exit;
    }
}
