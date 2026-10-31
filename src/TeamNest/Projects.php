<?php
/**
 * TeamNest projects. A project may be billed to a Facturo client at an
 * hourly rate: its unbilled time becomes a draft invoice.
 */
declare(strict_types=1);

namespace App\TeamNest;

use App\Database;
use App\Facturo\Clients;
use App\Facturo\Documents;
use App\Facturo\Money;
use App\RendezVous\Booking;
use App\Suite\Tenant;

final class Projects
{
    /**
     * @return list<array<string,mixed>> with task counts, overdue and unbilled minutes
     */
    public static function all(int $orgId, bool $archived = false): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT p.*, c.name AS client_name,
                    (SELECT COUNT(*) FROM teamnest_tasks t WHERE t.project_id = p.id AND t.status <> \'done\') AS open_tasks,
                    (SELECT COUNT(*) FROM teamnest_tasks t WHERE t.project_id = p.id AND t.status = \'done\') AS done_tasks,
                    (SELECT COUNT(*) FROM teamnest_tasks t WHERE t.project_id = p.id AND t.status <> \'done\' AND t.due_date < :today) AS overdue,
                    (SELECT COALESCE(SUM(tt.minutes), 0) FROM teamnest_time tt JOIN teamnest_tasks t ON t.id = tt.task_id
                      WHERE t.project_id = p.id AND tt.billed_invoice_id IS NULL) AS unbilled_min
             FROM teamnest_projects p LEFT JOIN facturo_clients c ON c.id = p.client_id
             WHERE p.organization_id = :oid AND p.status = :st ORDER BY p.name'
        );
        $stmt->execute([':today' => Booking::now()->format('Y-m-d'), ':oid' => $orgId, ':st' => $archived ? 'archived' : 'active']);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed>|null
     */
    public static function find(int $orgId, int $id): ?array
    {
        foreach ([false, true] as $archived) {
            foreach (self::all($orgId, $archived) as $p) {
                if ((int) $p['id'] === $id) {
                    return $p;
                }
            }
        }
        return null;
    }

    /**
     * @param array<string,mixed> $in name, description, client_id (0 = none), hourly_rate ("1500.00" or "")
     * @return array{0:int,1:?string}
     */
    public static function save(int $orgId, int $id, array $in): array
    {
        $name   = trim((string) ($in['name'] ?? ''));
        $desc   = trim((string) ($in['description'] ?? ''));
        $client = (int) ($in['client_id'] ?? 0);
        $rateIn = trim((string) ($in['hourly_rate'] ?? ''));
        $rate   = $rateIn === '' ? null : Money::parseCents($rateIn);
        if ($name === '' || mb_strlen($name) > 150) {
            return [0, 'Le nom du projet est obligatoire (150 caractères max.).'];
        }
        if (mb_strlen($desc) > 2000) {
            return [0, 'La description est trop longue (2000 caractères max.).'];
        }
        if ($client > 0 && Clients::find($orgId, $client) === null) {
            return [0, 'Client introuvable.'];
        }
        if ($rateIn !== '' && ($rate === null || $rate < 0)) {
            return [0, 'Taux horaire invalide.'];
        }
        $params = [':oid' => $orgId, ':n' => $name, ':d' => $desc !== '' ? $desc : null, ':c' => $client > 0 ? $client : null, ':r' => $rate];
        $pdo    = Database::connection();
        if ($id === 0) {
            $pdo->prepare(
                'INSERT INTO teamnest_projects (organization_id, name, description, client_id, hourly_rate_cents, created_at)
                 VALUES (:oid, :n, :d, :c, :r, :now)'
            )->execute($params + [':now' => Booking::now()->format('Y-m-d H:i:s')]);
            return [(int) $pdo->lastInsertId(), null];
        }
        if (self::find($orgId, $id) === null) {
            return [0, 'Projet introuvable.'];
        }
        $pdo->prepare(
            'UPDATE teamnest_projects SET name = :n, description = :d, client_id = :c, hourly_rate_cents = :r
             WHERE organization_id = :oid AND id = :id'
        )->execute($params + [':id' => $id]);
        return [$id, null];
    }

    public static function setArchived(int $orgId, int $id, bool $archived): ?string
    {
        if (self::find($orgId, $id) === null) {
            return 'Projet introuvable.';
        }
        Database::connection()->prepare('UPDATE teamnest_projects SET status = :s WHERE organization_id = :oid AND id = :id')
            ->execute([':s' => $archived ? 'archived' : 'active', ':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /**
     * Turn the project's unbilled time into a draft Facturo invoice (one line
     * per task, in hours at the project rate). The time is marked billed by
     * that invoice; deleting the draft frees it again (foreign key SET NULL).
     *
     * @return array{0:?int,1:?string} [invoice id, error]
     */
    public static function bill(int $orgId, int $userId, int $id): array
    {
        $p = self::find($orgId, $id);
        if ($p === null) {
            return [null, 'Projet introuvable.'];
        }
        if ($p['client_id'] === null || $p['hourly_rate_cents'] === null) {
            return [null, 'Indiquez le client et le taux horaire du projet avant de le facturer.'];
        }
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT tt.id, tt.minutes, t.id AS task_id, t.title
                 FROM teamnest_time tt JOIN teamnest_tasks t ON t.id = tt.task_id
                 WHERE t.project_id = :p AND tt.billed_invoice_id IS NULL ORDER BY t.id, tt.id FOR UPDATE'
            );
            $stmt->execute([':p' => $id]);
            $entries = $stmt->fetchAll();
            if ($entries === []) {
                $pdo->rollBack();
                return [null, 'Aucun temps à facturer sur ce projet.'];
            }
            $perTask = [];
            foreach ($entries as $e) {
                $perTask[(int) $e['task_id']] ??= ['title' => (string) $e['title'], 'minutes' => 0];
                $perTask[(int) $e['task_id']]['minutes'] += (int) $e['minutes'];
            }
            $taxCode = Tenant::profile($orgId)['vat_number'] !== '' ? 'TC01' : 'TC03';
            $lines   = [];
            foreach ($perTask as $task) {
                $lines[] = [
                    'description' => mb_substr($p['name'] . ' — ' . $task['title'], 0, 500),
                    'quantity'    => rtrim(rtrim(number_format($task['minutes'] / 60, 3, '.', ''), '0'), '.'),
                    'unit_price'  => Money::toInput((int) $p['hourly_rate_cents']),
                    'tax_code'    => $taxCode,
                    'nature'      => 'SERVICES',
                ];
            }
            [$draft, $error] = Documents::validate($orgId, [
                'type' => 'invoice', 'client_id' => (int) $p['client_id'], 'issue_date' => Booking::now()->format('Y-m-d'),
                'due_date' => '', 'currency' => 'MUR', 'notes' => 'Temps passé sur le projet « ' . $p['name'] . ' » (heures).', 'lines' => $lines,
            ]);
            if ($error !== null) {
                $pdo->rollBack();
                return [null, $error];
            }
            // saveDraft runs its own transaction: commit the lock scope first, then mark under a fresh check.
            $pdo->commit();
        } catch (\Throwable $ex) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $ex;
        }

        [$invoiceId, $error] = Documents::saveDraft($orgId, $userId, 0, $draft);
        if ($error !== null) {
            return [null, $error];
        }
        $ids  = implode(',', array_map(static fn (array $e): int => (int) $e['id'], $entries));
        $mark = $pdo->prepare("UPDATE teamnest_time SET billed_invoice_id = :inv WHERE id IN ($ids) AND billed_invoice_id IS NULL");
        $mark->execute([':inv' => $invoiceId]);
        if ($mark->rowCount() !== count($entries)) {
            // Someone billed part of this time meanwhile: drop our draft rather than bill twice.
            Documents::delete($orgId, $invoiceId);
            $pdo->prepare('UPDATE teamnest_time SET billed_invoice_id = NULL WHERE billed_invoice_id = :inv')->execute([':inv' => $invoiceId]);
            return [null, 'Ce temps vient d\'être facturé par quelqu\'un d\'autre. Rechargez la page.'];
        }
        return [$invoiceId, null];
    }
}
