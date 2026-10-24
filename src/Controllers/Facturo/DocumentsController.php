<?php
/**
 * POST /api/facturo/documents
 *
 * Input (JSON body), by action:
 *   save    { "id": 0|<id>, "type": "quote"|"invoice", "client_id", "issue_date", "due_date",
 *             "currency", "notes", "lines": [{ "description", "quantity", "unit_price", "tax_rate" }] }
 *   issue   { "id" }
 *   status  { "id", "status" }
 *   convert { "id" }                      quote → draft invoice
 *   credit  { "id" }                      invoice → draft credit note (remaining amount)
 *   email   { "id", "to", "subject", "message" }   issued documents only
 *   mra     { "id" }                      retry MRA fiscalisation of a pending/rejected document
 *   delete  { "id" }                      drafts only
 *
 * Responses:
 *   200 { "success": true, "id": <document id> }
 *   409 { "error": "..." }               not allowed in the document's current state
 *   422 { "error": "..." }               invalid input
 */
declare(strict_types=1);

namespace App\Controllers\Facturo;

use App\Facturo\Api;
use App\Facturo\DocumentMailer;
use App\Facturo\Documents;
use App\Facturo\Fiscalisation;
use App\Request;
use App\Response;

final class DocumentsController
{
    public function handle(): void
    {
        [$user, $org] = Api::context();
        $data = Request::json();
        $id   = Request::int($data, 'id');

        switch (Request::str($data, 'action', 16)) {
            case 'save':
                [$draft, $error] = Documents::validate($org['id'], $data, $id);
                if ($error !== null) {
                    Response::json(['error' => $error], 422);
                }
                [$id, $error] = Documents::saveDraft($org['id'], (int) $user['id'], $id, $draft);
                $this->done($id, $error);

            case 'issue':
                $error = Documents::issue($org['id'], $id);
                if ($error === null) {
                    Fiscalisation::processPending($org['id']);   // outcome is shown on the document
                }
                $this->done($id, $error);

            case 'mra':
                $error = Fiscalisation::requeue($org['id'], $id);
                if ($error === null) {
                    Fiscalisation::processPending($org['id']);
                }
                $this->done($id, $error);

            case 'status':
                $this->done($id, Documents::setStatus($org['id'], $id, Request::str($data, 'status', 16)));

            case 'convert':
                [$invoiceId, $error] = Documents::convertToInvoice($org['id'], (int) $user['id'], $id);
                $this->done($invoiceId, $error);

            case 'credit':
                [$creditId, $error] = Documents::createCreditNote($org['id'], (int) $user['id'], $id);
                $this->done($creditId, $error);

            case 'email':
                $this->done($id, DocumentMailer::send(
                    $org['id'],
                    (int) $user['id'],
                    $id,
                    Request::str($data, 'to', 300),
                    Request::str($data, 'subject', 300),
                    is_string($data['message'] ?? null) ? trim($data['message']) : ''
                ));

            case 'delete':
                $this->done($id, Documents::delete($org['id'], $id));

            default:
                Response::json(['error' => 'Invalid action.'], 422);
        }
    }

    private function done(int $id, ?string $error): never
    {
        if ($error !== null) {
            Response::json(['error' => $error], 409);
        }
        Response::json(['success' => true, 'id' => $id]);
    }
}
