<?php
/**
 * HMAC authentication gate for the merchant (machine-to-machine) API.
 * Resolves the calling merchant from a signed request or terminates with 401.
 */
declare(strict_types=1);

namespace App\Support;

use App\Response;
use App\Services\ApiKeyService;

final class ApiAuth
{
    /**
     * @return array{0:array<string,mixed>,1:string} [merchant row, raw request body]
     */
    public static function requireMerchant(): array
    {
        $method   = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $target   = (string) ($_SERVER['REQUEST_URI'] ?? '');
        $rawBody  = (string) file_get_contents('php://input');
        $headers  = self::headers();

        $merchant = ApiKeyService::make()->authenticate($method, $target, $rawBody, $headers);
        if ($merchant === null) {
            Response::json(['error' => 'Invalid or missing API signature.'], 401);
        }
        if ((string) $merchant['compliance_status'] !== 'CLEARED' || (string) $merchant['status'] !== 'ACTIVE') {
            Response::json(['error' => 'Merchant is not cleared to use the API.'], 403);
        }

        return [$merchant, $rawBody];
    }

    /** @return array<string,string> */
    private static function headers(): array
    {
        if (function_exists('getallheaders')) {
            /** @var array<string,string> $h */
            $h = getallheaders();
            return $h;
        }
        $out = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with((string) $key, 'HTTP_')) {
                $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr((string) $key, 5)))));
                $out[$name] = (string) $value;
            }
        }
        return $out;
    }
}
