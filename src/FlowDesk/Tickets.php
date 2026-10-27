<?php
/**
 * Support tickets and their threads.
 *
 * Numbers (#1, #2…) are gap-free per organization: the settings row is locked
 * while a ticket takes the next number. Times are Mauritius local time, written
 * by the application. An agent reply waits for the customer ("pending"); a
 * customer reply puts the ticket back in the queue ("open").
 */
declare(strict_types=1);

namespace App\FlowDesk;

use App\ClientBloom\Customers;
use App\Database;
use App\RendezVous\Booking;

final class Tickets
{
    public const STATUSES   = ['open' => 'À traiter', 'pending' => 'En attente du client', 'resolved' => 'Résolu', 'closed' => 'Clôturé'];
    public const PRIORITIES = ['low' => 'Basse', 'normal' => 'Normale', 'high' => 'Haute', 'urgent' => 'Urgente'];
    public const FILTERS    = ['todo' => 'À traiter', 'mine' => 'Mes tickets', 'pending' => 'En attente', 'done' => 'Résolus', 'all' => 'Tous'];

    private const IP_TICKETS_PER_HOUR = 5;
    private const IP_REPLIES_PER_HOUR = 20;
    private const MAX_BODY = 10000;

    /**
     * Open a ticket with its first message.
     * $source: web (support form) | staff (back office) | formelio (form response).
     *
     * @param array<string,mixed>  $in name, email, phone, subject, message
     * @param array<string,string> $t  Text::for() of the customer's language
     * @return array{0:?array<string,mixed>,1:?string}
     */
    public static function create(int $orgId, array $in, string $source, ?int $userId, ?string $ip, array $t): array
    {
        $name    = trim(preg_replace('/\s+/u', ' ', (string) ($in['name'] ?? '')) ?? '');
        $email   = trim((string) ($in['email'] ?? ''));
        $phoneIn = trim((string) ($in['phone'] ?? ''));
        $phone   = $phoneIn === '' ? null : Customers::normalizePhone($phoneIn);
        $subject = trim(preg_replace('/\s+/u', ' ', (string) ($in['subject'] ?? '')) ?? '');
        $body    = trim((string) ($in['message'] ?? ''));

        if ($name === '' || mb_strlen($name) > 120) {
            return [null, $t['err_name']];
        }
        if (($email !== '' || $source === 'web') && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return [null, $t['err_contact']];
        }
        if ($phoneIn !== '' && $phone === null) {
            return [null, $t['err_phone']];
        }
        if ($subject === '' || mb_strlen($subject) > 200) {
            return [null, $t['err_subject']];
        }
        if ($body === '' || mb_strlen($body) > self::MAX_BODY) {
            return [null, $t['err_message']];
        }

        $pdo = Database::connection();
        $now = Booking::now()->format('Y-m-d H:i:s');
        if ($source === 'web') {
            $rate = $pdo->prepare('SELECT COUNT(*) FROM flowdesk_tickets WHERE created_ip = :ip AND created_at >= :since');
            $rate->execute([':ip' => (string) $ip, ':since' => Booking::now()->modify('-1 hour')->format('Y-m-d H:i:s')]);
            if ((int) $rate->fetchColumn() >= self::IP_TICKETS_PER_HOUR) {
                return [null, $t['err_limit']];
            }
        }

        Settings::get($orgId);
        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare('SELECT last_number FROM flowdesk_settings WHERE organization_id = :oid FOR UPDATE');
            $lock->execute([':oid' => $orgId]);
            $number = (int) $lock->fetchColumn() + 1;
            $pdo->prepare('UPDATE flowdesk_settings SET last_number = :n WHERE organization_id = :oid')
                ->execute([':n' => $number, ':oid' => $orgId]);
            $pdo->prepare(
                'INSERT INTO flowdesk_tickets (organization_id, number, subject, customer_name, email, phone, source, token,
                                               created_ip, created_at, updated_at)
                 VALUES (:oid, :n, :s, :name, :email, :phone, :src, :tok, :ip, :now, :now2)'
            )->execute([
                ':oid' => $orgId, ':n' => $number, ':s' => $subject, ':name' => $name, ':email' => $email !== '' ? $email : null,
                ':phone' => $phone, ':src' => $source, ':tok' => bin2hex(random_bytes(24)),
                ':ip' => $source === 'web' ? $ip : null, ':now' => $now, ':now2' => $now,
            ]);
            $id = (int) $pdo->lastInsertId();
            $pdo->prepare(
                'INSERT INTO flowdesk_messages (ticket_id, kind, user_id, body, created_ip, created_at)
                 VALUES (:t, \'customer\', :u, :b, :ip, :now)'
            )->execute([':t' => $id, ':u' => $source === 'staff' ? $userId : null, ':b' => $body,
                        ':ip' => $source === 'web' ? $ip : null, ':now' => $now]);
            $pdo->commit();
        } catch (\Throwable $ex) {
            $pdo->rollBack();
            throw $ex;
        }

        $ticket = self::find($orgId, $id);
        Notifier::safely(static fn () => Notifier::created($orgId, $ticket, $body));
        return [$ticket, null];
    }

    /**
     * Open a ticket from a Formelio response: contact details from the first
     * name / e-mail / phone answers, every answer in the message.
     *
     * @param array<string,mixed>            $form
     * @param list<array<string,mixed>>      $answers  as stored with the response
     */
    public static function fromFormResponse(int $orgId, array $form, array $answers): ?string
    {
        $pick = static function (array $types, ?string $labelHint = null) use ($answers): string {
            foreach ($answers as $a) {
                if (in_array($a['type'], $types, true) && is_scalar($a['value']) && (string) $a['value'] !== ''
                    && ($labelHint === null || preg_match($labelHint, (string) $a['label']))) {
                    return (string) $a['value'];
                }
            }
            return '';
        };
        $name  = $pick(['text'], '/\b(nom|name|prénom)\b/iu') ?: $pick(['text']);
        $lines = [];
        foreach ($answers as $a) {
            $v = is_array($a['value']) ? implode(', ', $a['value']) : (string) ($a['value'] ?? '');
            $lines[] = $a['label'] . "\n" . ($v !== '' ? $v : '—');
        }
        [, $error] = self::create($orgId, [
            'name' => mb_substr($name !== '' ? $name : 'Réponse au formulaire', 0, 120), 'email' => $pick(['email']),
            'phone' => $pick(['phone']), 'subject' => mb_substr((string) $form['title'], 0, 200),
            'message' => mb_substr(implode("\n\n", $lines), 0, self::MAX_BODY),
        ], 'formelio', null, null, Text::for('fr'));
        return $error;
    }

    /**
     * @return array<string,mixed>|null with assignee_name
     */
    public static function find(int $orgId, int $id): ?array
    {
        $rows = self::query('t.organization_id = ? AND t.id = ?', [$orgId, $id]);
        return $rows[0] ?? null;
    }

    /**
     * @return array{0:int,1:array<string,mixed>}|null [orgId, ticket]
     */
    public static function findByToken(string $token): ?array
    {
        if (!preg_match('/^[0-9a-f]{48}$/', $token)) {
            return null;
        }
        $rows = self::query('t.token = ?', [$token]);
        return isset($rows[0]) ? [(int) $rows[0]['organization_id'], $rows[0]] : null;
    }

    /**
     * @return list<array<string,mixed>> oldest first, with author_name
     */
    public static function messages(int $ticketId, bool $withNotes = true): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT m.id, m.kind, m.body, m.created_at, u.name AS author_name, u.email AS author_email
             FROM flowdesk_messages m LEFT JOIN users u ON u.id = m.user_id
             WHERE m.ticket_id = :t' . ($withNotes ? '' : ' AND m.kind <> \'note\'') . ' ORDER BY m.id'
        );
        $stmt->execute([':t' => $ticketId]);
        return $stmt->fetchAll();
    }

    /**
     * @return list<array<string,mixed>>
     */
    public static function inbox(int $orgId, string $filter, int $userId, string $q = ''): array
    {
        [$where, $params] = self::filterSql($filter, $userId);
        $where = 't.organization_id = ? AND ' . $where;
        $params = array_merge([$orgId], $params);
        if ($q !== '') {
            $digits = ltrim($q, '#');
            $where .= ' AND (t.subject LIKE ? OR t.customer_name LIKE ? OR t.email LIKE ? OR t.phone LIKE ?'
                    . (ctype_digit($digits) ? ' OR t.number = ?' : '') . ')';
            $like = '%' . addcslashes($q, '%_\\') . '%';
            array_push($params, $like, $like, $like, $like);
            if (ctype_digit($digits)) {
                $params[] = (int) $digits;
            }
        }
        return self::query($where, $params, 'ORDER BY FIELD(t.priority, \'urgent\', \'high\', \'normal\', \'low\'), t.updated_at ASC', 300);
    }

    /**
     * @return array<string,int> filter => count
     */
    public static function counts(int $orgId, int $userId): array
    {
        $out = [];
        foreach (array_keys(self::FILTERS) as $f) {
            [$where, $params] = self::filterSql($f, $userId);
            $stmt = Database::connection()->prepare('SELECT COUNT(*) FROM flowdesk_tickets t WHERE t.organization_id = ? AND ' . $where);
            $stmt->execute(array_merge([$orgId], $params));
            $out[$f] = (int) $stmt->fetchColumn();
        }
        return $out;
    }

    /**
     * Agent answer ('reply', e-mailed to the customer) or internal note ('note').
     * A reply puts the ticket in "pending" unless $status says otherwise.
     */
    public static function answer(int $orgId, int $userId, int $id, string $kind, string $body, ?string $status): ?string
    {
        $ticket = self::find($orgId, $id);
        $body   = trim($body);
        if ($ticket === null) {
            return 'Ticket introuvable.';
        }
        if (!in_array($kind, ['reply', 'note'], true)) {
            return 'Type de message invalide.';
        }
        if ($body === '' || mb_strlen($body) > self::MAX_BODY) {
            return 'Le message est vide ou trop long (10 000 caractères max.).';
        }
        if ($kind === 'reply' && $ticket['email'] === null) {
            return 'Ce client n\'a pas d\'e-mail : contactez-le par téléphone et notez l\'échange en note interne.';
        }
        if ($status !== null && $status !== '' && !isset(self::STATUSES[$status])) {
            return 'Statut invalide.';
        }
        $next = $status !== null && $status !== '' ? $status : ($kind === 'reply' ? 'pending' : $ticket['status']);
        $now  = Booking::now()->format('Y-m-d H:i:s');
        $pdo  = Database::connection();
        $pdo->prepare(
            'INSERT INTO flowdesk_messages (ticket_id, kind, user_id, body, created_at) VALUES (:t, :k, :u, :b, :now)'
        )->execute([':t' => $id, ':k' => $kind, ':u' => $userId, ':b' => $body, ':now' => $now]);
        $pdo->prepare(
            'UPDATE flowdesk_tickets
             SET status = :s, updated_at = :now,
                 first_response_at = IF(:k = \'reply\' AND first_response_at IS NULL, :now2, first_response_at),
                 resolved_at = IF(:s2 IN (\'resolved\', \'closed\'), COALESCE(resolved_at, :now3), NULL),
                 assignee_id = COALESCE(assignee_id, :u)
             WHERE organization_id = :oid AND id = :id'
        )->execute([':s' => $next, ':s2' => $next, ':k' => $kind, ':now' => $now, ':now2' => $now, ':now3' => $now,
                    ':u' => $userId, ':oid' => $orgId, ':id' => $id]);
        if ($kind === 'reply') {
            Notifier::safely(static fn () => Notifier::replied($orgId, self::find($orgId, $id), $body));
        }
        return null;
    }

    /**
     * Status, priority and assignee from the back office (null = unchanged; assignee 0 = nobody).
     */
    public static function update(int $orgId, int $id, ?string $status, ?string $priority, ?int $assignee): ?string
    {
        $ticket = self::find($orgId, $id);
        if ($ticket === null) {
            return 'Ticket introuvable.';
        }
        if ($status !== null && !isset(self::STATUSES[$status])) {
            return 'Statut invalide.';
        }
        if ($priority !== null && !isset(self::PRIORITIES[$priority])) {
            return 'Priorité invalide.';
        }
        if ($assignee !== null && $assignee > 0 && !isset(self::members($orgId)[$assignee])) {
            return 'Cette personne ne fait pas partie de l\'entreprise.';
        }
        $status   ??= (string) $ticket['status'];
        $priority ??= (string) $ticket['priority'];
        $assignee = $assignee === null ? ($ticket['assignee_id'] !== null ? (int) $ticket['assignee_id'] : null) : ($assignee > 0 ? $assignee : null);
        $now = Booking::now()->format('Y-m-d H:i:s');
        Database::connection()->prepare(
            'UPDATE flowdesk_tickets SET status = :s, priority = :p, assignee_id = :a, updated_at = :now,
                    resolved_at = IF(:s2 IN (\'resolved\', \'closed\'), COALESCE(resolved_at, :now2), NULL)
             WHERE organization_id = :oid AND id = :id'
        )->execute([':s' => $status, ':s2' => $status, ':p' => $priority, ':a' => $assignee, ':now' => $now, ':now2' => $now,
                    ':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /**
     * Customer reply from the ticket page. Reopens a resolved ticket; a closed one stays closed.
     *
     * @param array<string,string> $t
     */
    public static function customerReply(string $token, string $body, ?string $ip, array $t): ?string
    {
        $found = self::findByToken($token);
        if ($found === null) {
            return $t['not_found'];
        }
        [$orgId, $ticket] = $found;
        $body = trim($body);
        if ($ticket['status'] === 'closed') {
            return $t['ticket_closed'];
        }
        if ($body === '' || mb_strlen($body) > self::MAX_BODY) {
            return $t['err_message'];
        }
        $pdo  = Database::connection();
        $rate = $pdo->prepare(
            'SELECT COUNT(*) FROM flowdesk_messages WHERE ticket_id = :t AND kind = \'customer\' AND created_ip = :ip AND created_at >= :since'
        );
        $rate->execute([':t' => (int) $ticket['id'], ':ip' => (string) $ip, ':since' => Booking::now()->modify('-1 hour')->format('Y-m-d H:i:s')]);
        if ((int) $rate->fetchColumn() >= self::IP_REPLIES_PER_HOUR) {
            return $t['err_limit'];
        }
        $now = Booking::now()->format('Y-m-d H:i:s');
        $pdo->prepare(
            'INSERT INTO flowdesk_messages (ticket_id, kind, body, created_ip, created_at) VALUES (:t, \'customer\', :b, :ip, :now)'
        )->execute([':t' => (int) $ticket['id'], ':b' => $body, ':ip' => $ip, ':now' => $now]);
        $pdo->prepare('UPDATE flowdesk_tickets SET status = \'open\', resolved_at = NULL, updated_at = :now WHERE id = :id')
            ->execute([':now' => $now, ':id' => (int) $ticket['id']]);
        Notifier::safely(static fn () => Notifier::customerReplied($orgId, self::find($orgId, (int) $ticket['id']), $body));
        return null;
    }

    /**
     * Members of the organization who can be assigned, id => name.
     *
     * @return array<int,string>
     */
    public static function members(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT u.id, COALESCE(NULLIF(u.name, \'\'), u.email) AS name
             FROM organization_users ou JOIN users u ON u.id = ou.user_id
             WHERE ou.organization_id = :oid AND u.is_active = 1 ORDER BY name'
        );
        $stmt->execute([':oid' => $orgId]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['id']] = (string) $r['name'];
        }
        return $out;
    }

    /**
     * ClientBloom customer matching the ticket's phone, then e-mail.
     *
     * @param array<string,mixed> $ticket
     * @return array<string,mixed>|null
     */
    public static function loyaltyCustomer(int $orgId, array $ticket): ?array
    {
        return Customers::findByPhone($orgId, (string) ($ticket['phone'] ?? ''))
            ?? Customers::findByEmail($orgId, (string) ($ticket['email'] ?? ''));
    }

    /**
     * @return array{0:string,1:list<mixed>}
     */
    private static function filterSql(string $filter, int $userId): array
    {
        return match ($filter) {
            'mine'    => ['t.assignee_id = ? AND t.status IN (\'open\', \'pending\')', [$userId]],
            'pending' => ['t.status = \'pending\'', []],
            'done'    => ['t.status IN (\'resolved\', \'closed\')', []],
            'all'     => ['1 = 1', []],
            default   => ['t.status = \'open\'', []],
        };
    }

    /**
     * @param list<mixed> $params
     * @return list<array<string,mixed>>
     */
    private static function query(string $where, array $params, string $order = 'ORDER BY t.id', int $limit = 1000): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT t.*, COALESCE(NULLIF(u.name, \'\'), u.email) AS assignee_name,
                    (SELECT COUNT(*) FROM flowdesk_messages m WHERE m.ticket_id = t.id AND m.kind <> \'note\') AS message_count
             FROM flowdesk_tickets t LEFT JOIN users u ON u.id = t.assignee_id
             WHERE ' . $where . ' ' . $order . ' LIMIT ' . $limit
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
