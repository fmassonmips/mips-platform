<?php
/**
 * Formelio forms: title, description and a list of fields kept as JSON.
 * Field ids ("f1", "f2", …) never change, so answers stay attached to their
 * question when the form is edited.
 */
declare(strict_types=1);

namespace App\Formelio;

use App\Database;

final class Forms
{
    public const TYPES = [
        'text' => 'Texte court', 'textarea' => 'Texte long', 'email' => 'E-mail', 'phone' => 'Téléphone',
        'number' => 'Nombre', 'date' => 'Date', 'choice' => 'Choix unique', 'multi' => 'Choix multiples',
        'rating' => 'Note de 1 à 5', 'nps' => 'Recommandation (0 à 10)',
    ];
    public const STATUSES = ['draft' => 'Brouillon', 'open' => 'Ouvert', 'closed' => 'Fermé'];

    private const MAX_FIELDS  = 50;
    private const MAX_OPTIONS = 30;

    /** Ready-made forms offered on the list page. */
    public const TEMPLATES = [
        'satisfaction' => [
            'title' => 'Votre avis compte', 'description' => 'Deux minutes pour nous dire comment s\'est passée votre visite.',
            'fields' => [
                ['type' => 'rating', 'label' => 'Êtes-vous satisfait(e) de votre visite ?', 'required' => true],
                ['type' => 'nps', 'label' => 'Recommanderiez-vous notre entreprise à un proche ?', 'required' => true],
                ['type' => 'textarea', 'label' => 'Qu\'est-ce qui vous a plu, ou que pourrions-nous améliorer ?', 'required' => false],
            ],
        ],
        'contact' => [
            'title' => 'Nous contacter', 'description' => '',
            'fields' => [
                ['type' => 'text', 'label' => 'Nom', 'required' => true],
                ['type' => 'email', 'label' => 'E-mail', 'required' => true],
                ['type' => 'phone', 'label' => 'Téléphone', 'required' => false],
                ['type' => 'textarea', 'label' => 'Message', 'required' => true],
            ],
        ],
        'event' => [
            'title' => 'Inscription', 'description' => '',
            'fields' => [
                ['type' => 'text', 'label' => 'Nom', 'required' => true],
                ['type' => 'phone', 'label' => 'Téléphone', 'required' => true],
                ['type' => 'email', 'label' => 'E-mail', 'required' => false],
                ['type' => 'number', 'label' => 'Nombre de personnes', 'required' => true],
                ['type' => 'choice', 'label' => 'Créneau', 'required' => true, 'options' => ['Matin', 'Après-midi']],
            ],
        ],
    ];

    /**
     * @return list<array<string,mixed>> with response_count
     */
    public static function all(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT f.id, f.title, f.status, f.public_token, f.updated_at,
                    (SELECT COUNT(*) FROM formelio_responses r WHERE r.form_id = f.id) AS response_count,
                    (SELECT MAX(r.created_at) FROM formelio_responses r WHERE r.form_id = f.id) AS last_response_at
             FROM formelio_forms f WHERE f.organization_id = :oid ORDER BY f.id DESC'
        );
        $stmt->execute([':oid' => $orgId]);
        return $stmt->fetchAll();
    }

    /**
     * @return array<string,mixed>|null fields decoded
     */
    public static function find(int $orgId, int $id): ?array
    {
        $stmt = Database::connection()->prepare('SELECT * FROM formelio_forms WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        $row = $stmt->fetch();
        return is_array($row) ? self::decode($row) : null;
    }

    /**
     * @return array<string,mixed>|null fields decoded
     */
    public static function findByToken(string $token): ?array
    {
        if (!preg_match('/^[0-9a-f]{32}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare('SELECT * FROM formelio_forms WHERE public_token = :t');
        $stmt->execute([':t' => $token]);
        $row = $stmt->fetch();
        return is_array($row) ? self::decode($row) : null;
    }

    /**
     * @return list<array{id:int,title:string}> open forms, for pickers in other apps
     */
    public static function openForms(int $orgId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, title FROM formelio_forms WHERE organization_id = :oid AND status = \'open\' ORDER BY title'
        );
        $stmt->execute([':oid' => $orgId]);
        return array_map(static fn (array $r): array => ['id' => (int) $r['id'], 'title' => (string) $r['title']], $stmt->fetchAll());
    }

    /**
     * Create from a template (or empty). Returns the new id.
     */
    public static function create(int $orgId, string $template): int
    {
        $tpl = self::TEMPLATES[$template] ?? ['title' => 'Nouveau formulaire', 'description' => '',
                                               'fields' => [['type' => 'text', 'label' => 'Votre question', 'required' => false]]];
        $fields = [];
        foreach ($tpl['fields'] as $i => $f) {
            $fields[] = ['id' => 'f' . ($i + 1), 'type' => $f['type'], 'label' => $f['label'],
                         'required' => $f['required'], 'options' => $f['options'] ?? []];
        }
        $pdo = Database::connection();
        $pdo->prepare(
            'INSERT INTO formelio_forms (organization_id, title, description, fields, public_token)
             VALUES (:oid, :t, :d, :f, :tok)'
        )->execute([
            ':oid' => $orgId, ':t' => $tpl['title'], ':d' => $tpl['description'] !== '' ? $tpl['description'] : null,
            ':f' => json_encode($fields, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), ':tok' => bin2hex(random_bytes(16)),
        ]);
        return (int) $pdo->lastInsertId();
    }

    /**
     * Save title, texts and fields. Returns an error or null.
     *
     * @param array<string,mixed> $in title, description, thank_you, notify_email, flowdesk_ticket, fields (list)
     */
    public static function save(int $orgId, int $id, array $in): ?string
    {
        $form = self::find($orgId, $id);
        if ($form === null) {
            return 'Formulaire introuvable.';
        }
        $title  = trim((string) ($in['title'] ?? ''));
        $desc   = trim((string) ($in['description'] ?? ''));
        $thanks = trim((string) ($in['thank_you'] ?? ''));
        $email  = trim((string) ($in['notify_email'] ?? ''));
        if ($title === '' || mb_strlen($title) > 200) {
            return 'Le titre est obligatoire (200 caractères max.).';
        }
        if (mb_strlen($desc) > 1000 || mb_strlen($thanks) > 500) {
            return 'Le texte d\'introduction (1000) ou le message de remerciement (500) est trop long.';
        }
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return 'E-mail de notification invalide.';
        }
        [$fields, $error] = self::cleanFields(is_array($in['fields'] ?? null) ? $in['fields'] : [], $form['fields']);
        if ($error !== null) {
            return $error;
        }
        Database::connection()->prepare(
            'UPDATE formelio_forms SET title = :t, description = :d, thank_you = :ty, notify_email = :e, fields = :f,
                    flowdesk_ticket = :fd
             WHERE organization_id = :oid AND id = :id'
        )->execute([
            ':fd' => ($in['flowdesk_ticket'] ?? null) === null ? (int) $form['flowdesk_ticket'] : ($in['flowdesk_ticket'] ? 1 : 0),
            ':t' => $title, ':d' => $desc !== '' ? $desc : null, ':ty' => $thanks !== '' ? $thanks : null,
            ':e' => $email !== '' ? $email : null, ':f' => json_encode($fields, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':oid' => $orgId, ':id' => $id,
        ]);
        return null;
    }

    public static function setStatus(int $orgId, int $id, string $status): ?string
    {
        $form = self::find($orgId, $id);
        if ($form === null) {
            return 'Formulaire introuvable.';
        }
        if (!isset(self::STATUSES[$status])) {
            return 'Statut invalide.';
        }
        if ($status === 'open' && $form['fields'] === []) {
            return 'Ajoutez au moins une question avant d\'ouvrir le formulaire.';
        }
        Database::connection()->prepare('UPDATE formelio_forms SET status = :s WHERE organization_id = :oid AND id = :id')
            ->execute([':s' => $status, ':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /** Deletes the form and all its responses. */
    public static function delete(int $orgId, int $id): ?string
    {
        if (self::find($orgId, $id) === null) {
            return 'Formulaire introuvable.';
        }
        // RendezVous stops sending it as its survey (foreign key ON DELETE SET NULL).
        Database::connection()->prepare('DELETE FROM formelio_forms WHERE organization_id = :oid AND id = :id')->execute([':oid' => $orgId, ':id' => $id]);
        return null;
    }

    /** New public link; the old one stops working. */
    public static function newLink(int $orgId, int $id): void
    {
        Database::connection()->prepare('UPDATE formelio_forms SET public_token = :t WHERE organization_id = :oid AND id = :id')
            ->execute([':t' => bin2hex(random_bytes(16)), ':oid' => $orgId, ':id' => $id]);
    }

    /**
     * Validate submitted fields. Existing ids are kept; new fields (no or unknown id) get the next free id.
     *
     * @param list<mixed>                $raw
     * @param list<array<string,mixed>>  $current
     * @return array{0:list<array<string,mixed>>,1:?string}
     */
    private static function cleanFields(array $raw, array $current): array
    {
        if (count($raw) > self::MAX_FIELDS) {
            return [[], 'Un formulaire est limité à ' . self::MAX_FIELDS . ' questions.'];
        }
        $known = array_column($current, 'id');
        $next  = 1 + array_reduce($known, static fn (int $m, string $id): int => max($m, (int) substr($id, 1)), 0);
        $seen  = [];
        $out   = [];
        foreach (array_values($raw) as $i => $f) {
            $n     = $i + 1;
            $f     = is_array($f) ? $f : [];
            $type  = (string) ($f['type'] ?? '');
            $label = trim((string) ($f['label'] ?? ''));
            if (!isset(self::TYPES[$type])) {
                return [[], "Question $n : type invalide."];
            }
            if ($label === '' || mb_strlen($label) > 300) {
                return [[], "Question $n : l'intitulé est obligatoire (300 caractères max.)."];
            }
            $options = [];
            if ($type === 'choice' || $type === 'multi') {
                foreach (is_array($f['options'] ?? null) ? $f['options'] : [] as $o) {
                    $o = trim((string) $o);
                    if ($o !== '' && !in_array($o, $options, true)) {
                        $options[] = mb_substr($o, 0, 100);
                    }
                }
                if (count($options) < 2 || count($options) > self::MAX_OPTIONS) {
                    return [[], "Question $n : indiquez entre 2 et " . self::MAX_OPTIONS . ' choix, un par ligne.'];
                }
            }
            $id = (string) ($f['id'] ?? '');
            if (!in_array($id, $known, true) || isset($seen[$id])) {
                $id = 'f' . $next++;
            }
            $seen[$id] = true;
            $out[] = ['id' => $id, 'type' => $type, 'label' => $label, 'required' => ($f['required'] ?? false) === true, 'options' => $options];
        }
        return [$out, null];
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function decode(array $row): array
    {
        $fields = json_decode((string) $row['fields'], true);
        $row['fields'] = is_array($fields) ? $fields : [];
        return $row;
    }
}
