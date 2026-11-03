<?php
/**
 * BizPilot: the owner's one-page view of the business, read from the other
 * apps of the suite. No tables of its own. Periods are [from, to) on local
 * Mauritius dates; amounts in MUR cents (documents in other currencies are
 * counted apart, never added to rupees).
 */
declare(strict_types=1);

namespace App\BizPilot;

use App\Database;
use App\RendezVous\Booking;

final class Dashboard
{
    /** A quote still "sent" after this many days needs a follow-up. */
    public const QUOTE_FOLLOW_UP_DAYS = 14;

    /**
     * @return array<string,int>
     */
    public static function facturo(int $orgId, string $from, string $to): array
    {
        $pdo = Database::connection();
        $q = $pdo->prepare(
            'SELECT
               COALESCE(SUM(CASE WHEN type = \'invoice\' THEN total_cents END), 0)
             - COALESCE(SUM(CASE WHEN type = \'credit_note\' THEN total_cents END), 0) AS invoiced_cents,
               COALESCE(SUM(CASE WHEN type = \'invoice\' THEN subtotal_cents END), 0)
             - COALESCE(SUM(CASE WHEN type = \'credit_note\' THEN subtotal_cents END), 0) AS invoiced_ht_cents,
               COUNT(CASE WHEN type = \'invoice\' THEN 1 END) AS invoices,
               COUNT(CASE WHEN type = \'quote\' THEN 1 END) AS quotes,
               COUNT(CASE WHEN type = \'quote\' AND status = \'accepted\' THEN 1 END) AS quotes_accepted,
               COUNT(CASE WHEN type = \'quote\' AND status = \'declined\' THEN 1 END) AS quotes_declined
             FROM facturo_documents
             WHERE organization_id = :oid AND status <> \'draft\' AND currency = \'MUR\'
               AND issue_date >= :f AND issue_date < :t'
        );
        $q->execute([':oid' => $orgId, ':f' => $from, ':t' => $to]);
        $r = $q->fetch() ?: [];

        $p = $pdo->prepare(
            'SELECT COALESCE(SUM(total_cents), 0) FROM facturo_documents
             WHERE organization_id = :oid AND type = \'invoice\' AND status = \'paid\' AND currency = \'MUR\'
               AND paid_at >= :f AND paid_at < :t'
        );
        $p->execute([':oid' => $orgId, ':f' => $from . ' 00:00:00', ':t' => $to . ' 00:00:00']);
        $r['collected_cents'] = $p->fetchColumn();

        return array_map('intval', $r);
    }

    /**
     * Unpaid invoices now (net of their credit notes), overdue part, quotes waiting.
     *
     * @return array<string,int>
     */
    public static function receivables(int $orgId): array
    {
        $today = Booking::now()->format('Y-m-d');
        $stmt  = Database::connection()->prepare(
            'SELECT COUNT(*) AS unpaid,
                    COALESCE(SUM(i.total_cents - COALESCE(c.credited, 0)), 0) AS unpaid_cents,
                    COUNT(CASE WHEN i.due_date < :today THEN 1 END) AS overdue,
                    COALESCE(SUM(CASE WHEN i.due_date < :today2 THEN i.total_cents - COALESCE(c.credited, 0) END), 0) AS overdue_cents
             FROM facturo_documents i
             LEFT JOIN (SELECT source_document_id, SUM(total_cents) AS credited FROM facturo_documents
                        WHERE type = \'credit_note\' AND status <> \'draft\' GROUP BY source_document_id) c
                    ON c.source_document_id = i.id
             WHERE i.organization_id = :oid AND i.type = \'invoice\' AND i.status = \'issued\' AND i.currency = \'MUR\''
        );
        $stmt->execute([':oid' => $orgId, ':today' => $today, ':today2' => $today]);
        $r = array_map('intval', $stmt->fetch() ?: []);

        $q = Database::connection()->prepare(
            'SELECT COUNT(*) AS waiting, COALESCE(SUM(total_cents), 0) AS waiting_cents,
                    COUNT(CASE WHEN issue_date <= :limit THEN 1 END) AS stale
             FROM facturo_documents WHERE organization_id = :oid AND type = \'quote\' AND status = \'sent\' AND currency = \'MUR\''
        );
        $q->execute([':oid' => $orgId, ':limit' => Booking::now()->modify('-' . self::QUOTE_FOLLOW_UP_DAYS . ' days')->format('Y-m-d')]);
        $pdo = Database::connection();
        $m   = $pdo->prepare(
            'SELECT COUNT(*) FROM facturo_documents
             WHERE organization_id = :oid AND type IN (\'invoice\', \'credit_note\') AND mra_status IN (\'pending\', \'rejected\', \'unknown\')'
        );
        $m->execute([':oid' => $orgId]);
        $f = $pdo->prepare(
            'SELECT COUNT(*) FROM facturo_documents
             WHERE organization_id = :oid AND status <> \'draft\' AND currency <> \'MUR\''
        );
        $f->execute([':oid' => $orgId]);
        return $r + array_map('intval', $q->fetch() ?: []) + ['mra_blocked' => (int) $m->fetchColumn(), 'foreign_docs' => (int) $f->fetchColumn()];
    }

    /**
     * What unpaid MUR invoices should bring in: overdue, each of the next 4 weeks (from
     * today), later, and without a due date. Amount = total minus credit notes issued
     * against the invoice (no partial payments in Facturo). Plus the clients most overdue.
     *
     * @return array{buckets:list<array{key:string,from:?string,to:?string,cents:int,count:int}>,
     *               late_clients:list<array{id:int,name:string,cents:int,count:int,oldest:string}>}
     */
    public static function cashForecast(int $orgId, int $clients = 5): array
    {
        $today = Booking::now()->format('Y-m-d');
        $stmt  = Database::connection()->prepare(
            'SELECT i.id, i.client_id, i.due_date, i.total_cents - COALESCE(c.credited, 0) AS owed, cl.name AS client_name
             FROM facturo_documents i
             JOIN facturo_clients cl ON cl.id = i.client_id AND cl.organization_id = i.organization_id
             LEFT JOIN (SELECT source_document_id, SUM(total_cents) AS credited FROM facturo_documents
                        WHERE organization_id = :oid2 AND type = \'credit_note\' AND status <> \'draft\' GROUP BY source_document_id) c
                    ON c.source_document_id = i.id
             WHERE i.organization_id = :oid AND i.type = \'invoice\' AND i.status = \'issued\' AND i.currency = \'MUR\''
        );
        $stmt->execute([':oid' => $orgId, ':oid2' => $orgId]);

        $day     = static fn (int $n): string => Booking::now()->modify('+' . $n . ' days')->format('Y-m-d');
        $buckets = [['key' => 'late', 'from' => null, 'to' => Booking::now()->modify('-1 day')->format('Y-m-d'), 'cents' => 0, 'count' => 0]];
        for ($w = 0; $w < 4; $w++) {
            $buckets[] = ['key' => 'week' . ($w + 1), 'from' => $day(7 * $w), 'to' => $day(7 * $w + 6), 'cents' => 0, 'count' => 0];
        }
        $buckets[] = ['key' => 'later', 'from' => $day(28), 'to' => null, 'cents' => 0, 'count' => 0];
        $buckets[] = ['key' => 'no_due', 'from' => null, 'to' => null, 'cents' => 0, 'count' => 0];

        $late = [];
        foreach ($stmt->fetchAll() as $r) {
            $owed = (int) $r['owed'];
            if ($owed <= 0) {
                continue;
            }
            $due = $r['due_date'] !== null ? (string) $r['due_date'] : null;
            $i = match (true) {
                $due === null  => 6,
                $due < $today  => 0,
                $due >= $day(28) => 5,
                default        => 1 + intdiv((int) (new \DateTimeImmutable($today))->diff(new \DateTimeImmutable($due))->days, 7),
            };
            $buckets[$i]['cents'] += $owed;
            $buckets[$i]['count']++;
            if ($i === 0) {
                $cid = (int) $r['client_id'];
                $late[$cid] ??= ['id' => $cid, 'name' => (string) $r['client_name'], 'cents' => 0, 'count' => 0, 'oldest' => $due];
                $late[$cid]['cents'] += $owed;
                $late[$cid]['count']++;
                $late[$cid]['oldest'] = min($late[$cid]['oldest'], $due);
            }
        }
        usort($late, static fn (array $a, array $b): int => $b['cents'] <=> $a['cents'] ?: strcmp($a['name'], $b['name']));
        return ['buckets' => $buckets, 'late_clients' => array_slice($late, 0, $clients)];
    }

    /**
     * @return list<array{name:string,cents:int}>
     */
    public static function topClients(int $orgId, string $from, string $to, int $limit = 5): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT c.name,
                    SUM(CASE WHEN d.type = \'invoice\' THEN d.total_cents ELSE -d.total_cents END) AS cents
             FROM facturo_documents d JOIN facturo_clients c ON c.id = d.client_id
             WHERE d.organization_id = :oid AND d.type IN (\'invoice\', \'credit_note\') AND d.status <> \'draft\'
               AND d.currency = \'MUR\' AND d.issue_date >= :f AND d.issue_date < :t
             GROUP BY c.id, c.name HAVING cents > 0 ORDER BY cents DESC LIMIT ' . $limit
        );
        $stmt->execute([':oid' => $orgId, ':f' => $from, ':t' => $to]);
        return array_map(static fn (array $r): array => ['name' => (string) $r['name'], 'cents' => (int) $r['cents']], $stmt->fetchAll());
    }

    /**
     * Invoiced and collected per month, oldest first.
     *
     * @return list<array{month:string,invoiced:int,collected:int}>
     */
    public static function trend(int $orgId, string $lastMonth, int $months = 6): array
    {
        $out   = [];
        $start = new \DateTimeImmutable($lastMonth . '-01');
        for ($i = $months - 1; $i >= 0; $i--) {
            $m   = $start->modify("-$i months");
            $f   = self::facturo($orgId, $m->format('Y-m-d'), $m->modify('+1 month')->format('Y-m-d'));
            $out[] = ['month' => $m->format('Y-m'), 'invoiced' => $f['invoiced_cents'], 'collected' => $f['collected_cents']];
        }
        return $out;
    }

    /**
     * @return array<string,int>
     */
    public static function rendezvous(int $orgId, string $from, string $to): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(CASE WHEN a.status <> \'cancelled\' THEN 1 END) AS appointments,
                    COUNT(CASE WHEN a.status = \'done\' THEN 1 END) AS done,
                    COUNT(CASE WHEN a.status = \'no_show\' THEN 1 END) AS no_show,
                    COUNT(CASE WHEN a.status = \'cancelled\' THEN 1 END) AS cancelled,
                    COUNT(CASE WHEN a.source = \'online\' AND a.status <> \'cancelled\' THEN 1 END) AS online,
                    COALESCE(SUM(CASE WHEN a.status = \'done\' THEN s.price_cents END), 0) AS done_value_cents
             FROM rendezvous_appointments a JOIN rendezvous_services s ON s.id = a.service_id
             WHERE a.organization_id = :oid AND a.starts_at >= :f AND a.starts_at < :t'
        );
        $stmt->execute([':oid' => $orgId, ':f' => $from . ' 00:00:00', ':t' => $to . ' 00:00:00']);
        return array_map('intval', $stmt->fetch() ?: []);
    }

    public static function appointmentsToday(int $orgId): int
    {
        $today = Booking::now()->format('Y-m-d');
        $stmt  = Database::connection()->prepare(
            'SELECT COUNT(*) FROM rendezvous_appointments
             WHERE organization_id = :oid AND status = \'booked\' AND starts_at >= :f AND starts_at < :t'
        );
        $stmt->execute([':oid' => $orgId, ':f' => $today . ' 00:00:00', ':t' => Booking::now()->modify('+1 day')->format('Y-m-d') . ' 00:00:00']);
        return (int) $stmt->fetchColumn();
    }

    /**
     * @return array<string,int>
     */
    public static function clientbloom(int $orgId, string $from, string $to): array
    {
        $pdo = Database::connection();
        $t = $pdo->prepare(
            // Reversals are netted against the type of the transaction they cancel (as ClientBloom's KPIs).
            'SELECT COALESCE(SUM(CASE WHEN COALESCE(o.type, t.type) = \'purchase\'
                                       OR (t.type = \'adjust\' AND t.amount_cents < 0) THEN t.amount_cents END), 0) AS sales_cents,
                    COALESCE(SUM(CASE WHEN COALESCE(o.type, t.type) IN (\'purchase\', \'bonus\', \'adjust\')
                                       AND COALESCE(o.cashback_cents, t.cashback_cents) > 0 THEN t.cashback_cents END), 0) AS issued_cents,
                    COALESCE(-SUM(CASE WHEN COALESCE(o.type, t.type) = \'redeem\' THEN t.cashback_cents END), 0) AS redeemed_cents,
                    COUNT(DISTINCT CASE WHEN t.type = \'purchase\' THEN t.customer_id END) AS buyers
             FROM clientbloom_transactions t
             LEFT JOIN clientbloom_transactions o ON o.id = t.reversal_of
             WHERE t.organization_id = :oid AND t.created_at >= :f AND t.created_at < :t'
        );
        $t->execute([':oid' => $orgId, ':f' => $from . ' 00:00:00', ':t' => $to . ' 00:00:00']);
        $c = $pdo->prepare(
            'SELECT COUNT(*) AS customers, COALESCE(SUM(balance_cents), 0) AS outstanding_cents,
                    COUNT(CASE WHEN created_at >= :f AND created_at < :t THEN 1 END) AS new_customers
             FROM clientbloom_customers WHERE organization_id = :oid AND erased_at IS NULL'
        );
        $c->execute([':oid' => $orgId, ':f' => $from . ' 00:00:00', ':t' => $to . ' 00:00:00']);
        return array_map('intval', ($t->fetch() ?: []) + ($c->fetch() ?: []));
    }

    /**
     * Responses in the period, and the NPS / average rating over every
     * recommendation (0-10) and rating (1-5) question answered in it.
     *
     * @return array{responses:int,nps:?int,nps_answers:int,rating:?float,rating_answers:int}
     */
    public static function formelio(int $orgId, string $from, string $to): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT answers FROM formelio_responses WHERE organization_id = :oid AND created_at >= :f AND created_at < :t'
        );
        $stmt->execute([':oid' => $orgId, ':f' => $from . ' 00:00:00', ':t' => $to . ' 00:00:00']);
        $n = 0;
        $nps = [];
        $ratings = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $json) {
            $n++;
            foreach (json_decode((string) $json, true) ?: [] as $a) {
                if ($a['value'] === null || $a['value'] === '') {
                    continue;
                }
                if ($a['type'] === 'nps') {
                    $nps[] = (int) $a['value'];
                } elseif ($a['type'] === 'rating') {
                    $ratings[] = (int) $a['value'];
                }
            }
        }
        $promoters  = count(array_filter($nps, static fn (int $v): bool => $v >= 9));
        $detractors = count(array_filter($nps, static fn (int $v): bool => $v <= 6));
        return [
            'responses'      => $n,
            'nps'            => $nps !== [] ? (int) round(100 * ($promoters - $detractors) / count($nps)) : null,
            'nps_answers'    => count($nps),
            'rating'         => $ratings !== [] ? array_sum($ratings) / count($ratings) : null,
            'rating_answers' => count($ratings),
        ];
    }

    /**
     * @return array<string,int|null>
     */
    public static function flowdesk(int $orgId, string $from, string $to): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(CASE WHEN created_at >= :f AND created_at < :t THEN 1 END) AS created,
                    COUNT(CASE WHEN resolved_at >= :f2 AND resolved_at < :t2 THEN 1 END) AS resolved,
                    AVG(CASE WHEN created_at >= :f3 AND created_at < :t3 AND first_response_at IS NOT NULL
                             THEN TIMESTAMPDIFF(MINUTE, created_at, first_response_at) END) AS first_response_min
             FROM flowdesk_tickets WHERE organization_id = :oid'
        );
        $f = $from . ' 00:00:00';
        $t = $to . ' 00:00:00';
        $stmt->execute([':oid' => $orgId, ':f' => $f, ':t' => $t, ':f2' => $f, ':t2' => $t, ':f3' => $f, ':t3' => $t]);
        $r = $stmt->fetch() ?: [];
        return [
            'created'            => (int) ($r['created'] ?? 0),
            'resolved'           => (int) ($r['resolved'] ?? 0),
            'first_response_min' => $r['first_response_min'] !== null ? (int) round((float) $r['first_response_min']) : null,
        ];
    }

    /**
     * Tickets needing the team now.
     *
     * @return array{open:int,unanswered:int,urgent:int}
     */
    public static function supportQueue(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT COUNT(*) AS open, COUNT(CASE WHEN first_response_at IS NULL THEN 1 END) AS unanswered,
                    COUNT(CASE WHEN priority IN (\'urgent\', \'high\') THEN 1 END) AS urgent
             FROM flowdesk_tickets WHERE organization_id = :oid AND status = \'open\''
        );
        $stmt->execute([':oid' => $orgId]);
        return array_map('intval', $stmt->fetch() ?: ['open' => 0, 'unanswered' => 0, 'urgent' => 0]);
    }

    /** Relative change in %, null when there is no base to compare with. */
    public static function delta(int|float|null $now, int|float|null $before): ?int
    {
        if ($now === null || $before === null || $before == 0) {
            return null;
        }
        return (int) round(100 * ($now - $before) / abs($before));
    }
}
