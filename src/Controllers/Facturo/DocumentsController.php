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
 *   reminders { "enabled": bool }          automatic reminders of overdue invoices (owner/admin)
 *
 * Owner/admin only: issue an invoice or credit note, change an invoice's status
 * (paid / unpaid), create a credit note, retry MRA. Members prepare drafts and
 * quotes, issue and follow quotes, and e-mail issued documents.
 *
 * Responses:
 *   200 { "success": true, "id": <document id> }
 *   403 { "error": "..." }               reserved to the owner and administrators
 *   409 { "error": "..." }               not allowed in the document's current state
 *   422 { "error": "..." }               invalid input
 */
declare(strict_types=1);

namespace App\Controllers\Facturo;

use App\ClientBloom\FacturoRewards;
use App\Facturo\Api;
use App\Facturo\DocumentMailer;
use App\Facturo\Documents;
use App\Facturo\Fiscalisation;
use App\Facturo\Reminders;
use App\Request;
use App\Response;
use App\Suite\Tenant;

final class DocumentsController
{
    public function handle(): void
    {
        [$user, $org] = Api::context();
        $data = Request::json();
        $id   = Request::int($data, 'id');
        $action = Request::str($data, 'action', 16);

        if (!Tenant::canManage($org) && self::fiscalAction($org['id'], $action, $id)) {
            Response::json(['error' => 'Réservé au propriétaire et aux administrateurs : demandez-leur d’émettre la facture, de la marquer payée ou de faire l’avoir.'], 403);
        }

        switch ($action) {
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
                    FacturoRewards::onCreditNoteIssued($org['id'], (int) $user['id'], $id);
                }
                $this->done($id, $error);

            case 'mra':
                $error = Fiscalisation::requeue($org['id'], $id);
                if ($error === null) {
                    Fiscalisation::processPending($org['id']);
                }
                $this->done($id, $error);

            case 'status':
                $error = Documents::setStatus($org['id'], $id, Request::str($data, 'status', 16));
                if ($error === null) {
                    FacturoRewards::onInvoiceStatusChanged($org['id'], (int) $user['id'], $id);   // shown on the invoice
                }
                $this->done($id, $error);

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

            case 'reminders':
                if (!Tenant::canManage($org)) {
                    Response::json(['error' => 'Réservé au propriétaire et aux administrateurs.'], 403);
                }
                Reminders::setEnabled($org['id'], ($data['enabled'] ?? false) === true);
                Response::json(['success' => true]);

            default:
                Response::json(['error' => 'Action invalide.'], 422);
        }
    }

    /**
     * Acts on the books (numbered invoice, MRA, payment state): anything but a quote.
     */
    private static function fiscalAction(int $orgId, string $action, int $id): bool
    {
        if (in_array($action, ['credit', 'mra'], true)) {
            return true;
        }
        if (!in_array($action, ['issue', 'status'], true)) {
            return false;
        }
        $doc = Documents::find($orgId, $id);
        return $doc === null || $doc['type'] !== 'quote';
    }

    private function done(int $id, ?string $error): never
    {
        if ($error !== null) {
            Response::json(['error' => $error], 409);
        }
        Response::json(['success' => true, 'id' => $id]);
    }
}
