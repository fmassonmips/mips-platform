<?php
/**
 * /api/interactions  — client interaction history.
 *
 *   GET    /api/interactions?client_id=N   list interactions for a client
 *   POST   /api/interactions?client_id=N   add an interaction
 *   DELETE /api/interactions?id=N          remove an interaction
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Models\Client;
use App\Models\Interaction;
use App\Request;
use App\Response;

final class InteractionController
{
    public function handle(): void
    {
        $user = Auth::require_auth();

        switch (Request::method()) {
            case 'GET':
                $this->index(Request::queryInt('client_id'));
                break;
            case 'POST':
                Request::requireCsrf();
                $this->store(Request::queryInt('client_id'), (int) $user['id']);
                break;
            case 'DELETE':
                Request::requireCsrf();
                $this->destroy(Request::queryInt('id'));
                break;
            default:
                Response::json(['error' => 'Method Not Allowed'], 405);
        }
    }

    private function index(?int $clientId): void
    {
        if ($clientId === null || Client::find($clientId) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        Response::json(['data' => Interaction::forClient($clientId)], 200);
    }

    private function store(?int $clientId, int $userId): void
    {
        if ($clientId === null || Client::find($clientId) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }

        $in     = Request::jsonBody();
        $errors = [];

        $type = is_string($in['type'] ?? null) ? $in['type'] : 'note';
        if (!in_array($type, Interaction::TYPES, true)) {
            $type = 'note';
        }

        $summary = trim((string) ($in['summary'] ?? ''));
        if ($summary === '') {
            $errors['summary'] = 'Summary is required.';
        } elseif (mb_strlen($summary) > 255) {
            $errors['summary'] = 'Summary is too long.';
        }

        $occurred = trim((string) ($in['occurred_at'] ?? ''));
        $occurred = self::normaliseDateTime($occurred);

        if ($errors !== []) {
            Response::json(['error' => 'Validation failed.', 'errors' => $errors], 422);
        }

        $details = is_string($in['details'] ?? null) ? trim($in['details']) : '';
        $id = Interaction::create($clientId, [
            'type'        => $type,
            'summary'     => $summary,
            'details'     => $details !== '' ? mb_substr($details, 0, 5000) : null,
            'occurred_at' => $occurred,
        ], $userId);

        Response::json(['data' => Interaction::find($id)], 201);
    }

    private function destroy(?int $id): void
    {
        if ($id === null || Interaction::find($id) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        Interaction::delete($id);
        Response::json(['success' => true], 200);
    }

    /**
     * Accept a date or datetime-local string; default to now when empty/invalid.
     */
    private static function normaliseDateTime(string $value): string
    {
        if ($value === '') {
            return date('Y-m-d H:i:s');
        }
        $value = str_replace('T', ' ', $value);
        $ts = strtotime($value);
        return $ts !== false ? date('Y-m-d H:i:s', $ts) : date('Y-m-d H:i:s');
    }
}
