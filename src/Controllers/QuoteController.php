<?php
/**
 * /api/quotes  — quote request (devis) CRUD + conversion.
 *
 *   GET    /api/quotes                       list (optional ?q=, ?client_id=, ?status=)
 *   GET    /api/quotes?id=N                  single quote
 *   POST   /api/quotes                       create
 *   PUT    /api/quotes?id=N                  update
 *   POST   /api/quotes?id=N&action=convert   link a quote to a created policy
 *   DELETE /api/quotes?id=N                 delete
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Models\Client;
use App\Models\Contract;
use App\Models\Quote;
use App\Request;
use App\Response;

final class QuoteController
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
                if (Request::queryString('action') === 'convert') {
                    $this->convert($id);
                } else {
                    $this->store((int) $user['id']);
                }
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
        $list = Quote::all(
            Request::queryString('q'),
            Request::queryInt('client_id'),
            Request::queryString('status')
        );
        Response::json(['data' => $list], 200);
    }

    private function show(int $id): void
    {
        $row = Quote::find($id);
        if ($row === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        Response::json(['data' => $row], 200);
    }

    private function store(int $userId): void
    {
        $data = $this->validate(Request::jsonBody(), true);
        try {
            $id = Quote::create($data, $userId);
        } catch (\PDOException $e) {
            $this->handlePdo($e);
        }
        Response::json(['data' => Quote::find($id)], 201);
    }

    private function update(?int $id): void
    {
        if ($id === null || Quote::find($id) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        $data = $this->validate(Request::jsonBody(), false);
        try {
            Quote::update($id, $data);
        } catch (\PDOException $e) {
            $this->handlePdo($e);
        }
        Response::json(['data' => Quote::find($id)], 200);
    }

    /**
     * Link an existing quote to a policy that was just created from it and
     * flip its status to "converted".
     */
    private function convert(?int $id): void
    {
        if ($id === null || Quote::find($id) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        $in         = Request::jsonBody();
        $contractId = isset($in['contract_id']) ? (int) $in['contract_id'] : 0;
        if ($contractId <= 0 || Contract::find($contractId) === null) {
            Response::json(['error' => 'A valid policy is required to convert.'], 422);
        }
        Quote::markConverted($id, $contractId);
        Response::json(['data' => Quote::find($id)], 200);
    }

    private function destroy(?int $id): void
    {
        if ($id === null || Quote::find($id) === null) {
            Response::json(['error' => 'Not found.'], 404);
        }
        Quote::delete($id);
        Response::json(['success' => true], 200);
    }

    /**
     * @param array<string,mixed> $in
     * @return array<string,mixed>
     */
    private function validate(array $in, bool $isCreate): array
    {
        $errors = [];

        $clientId = isset($in['client_id']) ? (int) $in['client_id'] : 0;
        if ($clientId <= 0 || Client::find($clientId) === null) {
            $errors['client_id'] = 'A valid client is required.';
        }

        $type = trim((string) ($in['type'] ?? ''));
        if ($type === '') {
            $errors['type'] = 'Insurance type is required.';
        } elseif (mb_strlen($type) > 60) {
            $errors['type'] = 'Insurance type is too long.';
        }

        $reference = trim((string) ($in['reference'] ?? ''));
        if ($reference === '' && $isCreate) {
            $reference = Quote::nextReference();
        } elseif ($reference === '') {
            $errors['reference'] = 'Reference is required.';
        } elseif (mb_strlen($reference) > 40) {
            $errors['reference'] = 'Reference is too long.';
        }

        $status = is_string($in['status'] ?? null) ? $in['status'] : 'new';
        if (!in_array($status, Quote::STATUSES, true)) {
            $status = 'new';
        }

        $estimated = null;
        if (isset($in['estimated_premium']) && is_numeric($in['estimated_premium'])) {
            $n = max(0.0, (float) $in['estimated_premium']);
            $estimated = number_format($n, 2, '.', '');
        }

        if ($errors !== []) {
            Response::json(['error' => 'Validation failed.', 'errors' => $errors], 422);
        }

        $details = is_string($in['details'] ?? null) ? trim($in['details']) : '';

        return [
            'client_id'         => $clientId,
            'reference'         => $reference,
            'type'              => $type,
            'details'           => $details !== '' ? mb_substr($details, 0, 5000) : null,
            'estimated_premium' => $estimated,
            'status'            => $status,
        ];
    }

    private function handlePdo(\PDOException $e): never
    {
        if ($e->getCode() === '23000') {
            Response::json([
                'error'  => 'Validation failed.',
                'errors' => ['reference' => 'This reference is already in use.'],
            ], 422);
        }
        error_log('[Quote] ' . $e->getMessage());
        Response::json(['error' => 'Could not save the quote.'], 500);
    }
}
