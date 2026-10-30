<?php
/**
 * POST /api/suite/import — import a list from Excel (CSV), owner/admin, app writable.
 *
 * Input (JSON body):
 *   preview { "type": "clients" | "customers" | "products", "file": <base64 CSV> }
 *           → { "header", "mapping": {field: column|-1}, "rows", "result" }   nothing saved
 *   check   { "type", "file", "mapping" }   → { "result" }                       nothing saved
 *   import  { "type", "file", "mapping" }   → { "result" }                       valid rows saved
 *   result = { "created", "duplicates", "errors": [{ "line", "message" }], "sample" }
 *
 * Responses: 200 · 401 / 403 / 405 / 419 / 422 { "error": "..." }
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Request;
use App\Response;
use App\Suite\Import;
use App\Suite\ModuleApi;
use App\Suite\Tenant;

final class ImportController
{
    public function handle(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            Response::json(['error' => 'Méthode non autorisée'], 405);
        }
        $data = Request::json();
        $type = Request::str($data, 'type', 20);
        if (!isset(Import::TYPES[$type])) {
            Response::json(['error' => 'Type d’import inconnu.'], 422);
        }
        [$user, $org] = ModuleApi::context(Import::TYPES[$type]['app']);
        if (!Tenant::canManage($org)) {
            Response::json(['error' => 'Seuls le propriétaire et les administrateurs importent des listes.'], 403);
        }

        [$header, $rows, $error] = Import::parse(is_string($data['file'] ?? null) ? $data['file'] : '');
        if ($error !== null) {
            Response::json(['error' => $error], 422);
        }
        $action  = Request::str($data, 'action', 10);
        $mapping = $action === 'preview' ? Import::guessMapping($type, $header) : self::mapping($type, $data['mapping'] ?? null, count($header));

        [$result, $error] = Import::run($type, $org['id'], (int) $user['id'], $rows, $mapping, $action === 'import');
        if ($error !== null && $action !== 'preview') {
            Response::json(['error' => $error], 422);
        }
        Response::json(['success' => true, 'header' => $header, 'mapping' => $mapping, 'rows' => count($rows), 'result' => $result]);
    }

    /**
     * @return array<string,int>
     */
    private static function mapping(string $type, mixed $raw, int $columns): array
    {
        $out = [];
        foreach (array_keys(Import::TYPES[$type]['fields']) as $field) {
            $col = is_array($raw) && is_int($raw[$field] ?? null) ? $raw[$field] : -1;
            $out[$field] = $col >= 0 && $col < $columns ? $col : -1;
        }
        return $out;
    }
}
