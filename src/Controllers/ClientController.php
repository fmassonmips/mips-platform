<?php
/**
 * /api/clients  — client (CRM) CRUD.
 *
 *   GET    /api/clients              list (optional ?q= search)
 *   GET    /api/clients?id=N         single client
 *   POST   /api/clients              create
 *   PUT    /api/clients?id=N         update
 *   DELETE /api/clients?id=N         delete
 *
 * All actions require an authenticated session. Mutations require a CSRF token.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Models\Client;
use App\Request;
use App\Response;

final class ClientController
{
    public function handle(): void
    {
        $user = Auth::require_auth();
        $id   = Request::queryInt('id');

        switch (Request::method()) {
            case 'GET':
                $id !== null ? $this->show($id) : $this->index();
                break;
            case 'POST':
                Request::requireCsrf();
                $this->store((int) $user['id']);
                break;
            case 'PUT':
            case 'PATCH':
                Request::requireCsrf();
                $this->update($id);
                break;
            case 'DELETE':
                Request::requireCsrf();
                $this->destroy($id);
                break;
            default:
                Response::json(['error' => 'Method Not Allowed'], 405);
        }
    }

    private function index(): void
    {
        $search = Request::queryString('q');
        Response::json(['data' => Client::all($search)], 200);
    }

    private function show(int $id): void
    {
        $client = Client::find($id);
        if ($client === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        Response::json(['data' => $client], 200);
    }

    private function store(int $userId): void
    {
        $data = $this->validate(Request::jsonBody());
        $id   = Client::create($data, $userId);
        Response::json(['data' => Client::find($id)], 201);
    }

    private function update(?int $id): void
    {
        if ($id === null || Client::find($id) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        $data = $this->validate(Request::jsonBody());
        Client::update($id, $data);
        Response::json(['data' => Client::find($id)], 200);
    }

    private function destroy(?int $id): void
    {
        if ($id === null || Client::find($id) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        Client::delete($id);
        Response::json(['success' => true], 200);
    }

    /**
     * @param array<string,mixed> $in
     * @return array<string,mixed>
     */
    private function validate(array $in): array
    {
        $errors = [];

        $type = is_string($in['type'] ?? null) ? $in['type'] : 'individual';
        if (!in_array($type, Client::TYPES, true)) {
            $type = 'individual';
        }

        $name = trim((string) ($in['name'] ?? ''));
        if ($name === '') {
            $errors['name'] = 'Name is required.';
        } elseif (mb_strlen($name) > 160) {
            $errors['name'] = 'Name is too long.';
        }

        $email = trim((string) ($in['email'] ?? ''));
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Email format is invalid.';
        }

        if ($errors !== []) {
            Response::json(['error' => 'Validation failed.', 'errors' => $errors], 422);
        }

        return [
            'type'    => $type,
            'name'    => $name,
            'email'   => $email !== '' ? $email : null,
            'phone'   => self::optional($in['phone'] ?? null, 40),
            'address' => self::optional($in['address'] ?? null, 255),
            'city'    => self::optional($in['city'] ?? null, 120),
            'notes'   => self::optional($in['notes'] ?? null, 5000),
        ];
    }

    private static function optional(mixed $value, int $max): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        return mb_substr($value, 0, $max);
    }
}
