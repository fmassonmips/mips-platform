<?php
/**
 * /api/contracts  — insurance policy CRUD.
 *
 *   GET    /api/contracts                     list (optional ?q=, ?client_id=, ?status=)
 *   GET    /api/contracts?id=N                single policy
 *   POST   /api/contracts                     create
 *   PUT    /api/contracts?id=N                update
 *   DELETE /api/contracts?id=N               delete
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Models\Client;
use App\Models\Contract;
use App\Request;
use App\Response;

final class ContractController
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
        $list = Contract::all(
            Request::queryString('q'),
            Request::queryInt('client_id'),
            Request::queryString('status')
        );
        Response::json(['data' => $list], 200);
    }

    private function show(int $id): void
    {
        $row = Contract::find($id);
        if ($row === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        Response::json(['data' => $row], 200);
    }

    private function store(int $userId): void
    {
        $data = $this->validate(Request::jsonBody());
        $id   = Contract::create($data, $userId);
        Response::json(['data' => Contract::find($id)], 201);
    }

    private function update(?int $id): void
    {
        if ($id === null || Contract::find($id) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        $data = $this->validate(Request::jsonBody());
        Contract::update($id, $data);
        Response::json(['data' => Contract::find($id)], 200);
    }

    private function destroy(?int $id): void
    {
        if ($id === null || Contract::find($id) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        Contract::delete($id);
        Response::json(['success' => true], 200);
    }

    /**
     * @param array<string,mixed> $in
     * @return array<string,mixed>
     */
    private function validate(array $in): array
    {
        $errors = [];

        $clientId = isset($in['client_id']) ? (int) $in['client_id'] : 0;
        if ($clientId <= 0 || Client::find($clientId) === null) {
            $errors['client_id'] = 'A valid client is required.';
        }

        $policy = trim((string) ($in['policy_number'] ?? ''));
        if ($policy === '') {
            $errors['policy_number'] = 'Policy number is required.';
        } elseif (mb_strlen($policy) > 80) {
            $errors['policy_number'] = 'Policy number is too long.';
        }

        $insurer = trim((string) ($in['insurer'] ?? ''));
        if ($insurer === '') {
            $errors['insurer'] = 'Insurer is required.';
        } elseif (mb_strlen($insurer) > 160) {
            $errors['insurer'] = 'Insurer is too long.';
        }

        $type = is_string($in['type'] ?? null) ? $in['type'] : 'other';
        if (!in_array($type, Contract::TYPES, true)) {
            $type = 'other';
        }

        $status = is_string($in['status'] ?? null) ? $in['status'] : 'active';
        if (!in_array($status, Contract::STATUSES, true)) {
            $status = 'active';
        }

        $premium    = self::money($in['premium'] ?? null);
        $commission = self::rate($in['commission_rate'] ?? null);

        $start = self::date($in['start_date'] ?? null);
        $end   = self::date($in['end_date'] ?? null);
        if ($start === null) {
            $errors['start_date'] = 'A valid effective date is required.';
        }
        if ($end === null) {
            $errors['end_date'] = 'A valid expiry date is required.';
        }
        if ($start !== null && $end !== null && $end < $start) {
            $errors['end_date'] = 'Expiry date must be on or after the effective date.';
        }

        if ($errors !== []) {
            Response::json(['error' => 'Validation failed.', 'errors' => $errors], 422);
        }

        return [
            'client_id'       => $clientId,
            'policy_number'   => $policy,
            'insurer'         => $insurer,
            'type'            => $type,
            'premium'         => $premium,
            'commission_rate' => $commission,
            'start_date'      => $start,
            'end_date'        => $end,
            'status'          => $status,
            'notes'           => self::optional($in['notes'] ?? null, 5000),
        ];
    }

    private static function money(mixed $v): string
    {
        $n = is_numeric($v) ? (float) $v : 0.0;
        if ($n < 0) {
            $n = 0.0;
        }
        return number_format($n, 2, '.', '');
    }

    private static function rate(mixed $v): string
    {
        $n = is_numeric($v) ? (float) $v : 0.0;
        $n = max(0.0, min(100.0, $n));
        return number_format($n, 2, '.', '');
    }

    private static function date(mixed $v): ?string
    {
        if (!is_string($v) || trim($v) === '') {
            return null;
        }
        $ts = strtotime(trim($v));
        return $ts !== false ? date('Y-m-d', $ts) : null;
    }

    private static function optional(mixed $value, int $max): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        return $value !== '' ? mb_substr($value, 0, $max) : null;
    }
}
