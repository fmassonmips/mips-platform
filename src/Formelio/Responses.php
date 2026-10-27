<?php
/**
 * Formelio responses: validated submission, listing, summary per question,
 * CSV rows. Each response keeps the label of every question as it was asked.
 */
declare(strict_types=1);

namespace App\Formelio;

use App\Database;
use App\RendezVous\Booking;

final class Responses
{
    /** Submissions allowed per IP address and form per hour. */
    private const IP_LIMIT = 20;

    /**
     * Validate and store a response to an open form.
     *
     * @param array<string,mixed>  $form   Forms::find()
     * @param array<string,mixed>  $raw    field id => value (string, or list for "multi")
     * @param array<string,string> $t      Text::for()
     * @return array{0:?int,1:?string}
     */
    public static function submit(array $form, array $raw, ?string $ip, ?string $source, array $t): array
    {
        $answers = [];
        foreach ($form['fields'] as $f) {
            [$value, $error] = self::clean($f, $raw[$f['id']] ?? null, $t);
            if ($error !== null) {
                return [null, $error];
            }
            $answers[] = ['id' => $f['id'], 'label' => $f['label'], 'type' => $f['type'], 'value' => $value];
        }

        $pdo  = Database::connection();
        $rate = $pdo->prepare(
            'SELECT COUNT(*) FROM formelio_responses WHERE form_id = :f AND created_ip = :ip AND created_at >= :since'
        );
        $rate->execute([':f' => (int) $form['id'], ':ip' => (string) $ip, ':since' => Booking::now()->modify('-1 hour')->format('Y-m-d H:i:s')]);
        if ((int) $rate->fetchColumn() >= self::IP_LIMIT) {
            return [null, $t['err_limit']];
        }
        if ($source !== null && self::hasSource((int) $form['id'], $source)) {
            return [null, $t['already']];
        }

        $pdo->prepare(
            'INSERT INTO formelio_responses (organization_id, form_id, answers, source, created_ip, created_at)
             VALUES (:oid, :f, :a, :src, :ip, :at)'
        )->execute([
            ':oid' => (int) $form['organization_id'], ':f' => (int) $form['id'],
            ':a' => json_encode($answers, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':src' => $source, ':ip' => $ip, ':at' => Booking::now()->format('Y-m-d H:i:s'),
        ]);
        return [(int) $pdo->lastInsertId(), null];
    }

    public static function hasSource(int $formId, string $source): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM formelio_responses WHERE form_id = :f AND source = :s LIMIT 1');
        $stmt->execute([':f' => $formId, ':s' => $source]);
        return $stmt->fetchColumn() !== false;
    }

    /**
     * Newest first, answers decoded.
     *
     * @return list<array<string,mixed>>
     */
    public static function forForm(int $orgId, int $formId, int $limit = 5000): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, answers, source, created_at FROM formelio_responses
             WHERE organization_id = :oid AND form_id = :f ORDER BY id DESC LIMIT ' . max(1, $limit)
        );
        $stmt->execute([':oid' => $orgId, ':f' => $formId]);
        return array_map(static function (array $r): array {
            $a = json_decode((string) $r['answers'], true);
            $r['answers'] = is_array($a) ? $a : [];
            return $r;
        }, $stmt->fetchAll());
    }

    public static function delete(int $orgId, int $id): ?string
    {
        $stmt = Database::connection()->prepare('DELETE FROM formelio_responses WHERE organization_id = :oid AND id = :id');
        $stmt->execute([':oid' => $orgId, ':id' => $id]);
        return $stmt->rowCount() === 1 ? null : 'Réponse introuvable.';
    }

    /**
     * Per-question summary over the current questions of the form.
     *
     * @param list<array<string,mixed>> $fields
     * @param list<array<string,mixed>> $responses
     * @return list<array<string,mixed>>
     */
    public static function summary(array $fields, array $responses): array
    {
        $out = [];
        foreach ($fields as $f) {
            $values = [];
            foreach ($responses as $r) {
                foreach ($r['answers'] as $a) {
                    if ($a['id'] === $f['id'] && $a['value'] !== null && $a['value'] !== '' && $a['value'] !== []) {
                        $values[] = $a['value'];
                    }
                }
            }
            $s = ['field' => $f, 'answered' => count($values)];
            switch ($f['type']) {
                case 'choice':
                case 'multi':
                    $counts = array_fill_keys($f['options'], 0);
                    foreach ($values as $v) {
                        foreach ((array) $v as $o) {
                            $counts[$o] = ($counts[$o] ?? 0) + 1;
                        }
                    }
                    $s['counts'] = $counts;
                    break;
                case 'rating':
                    $s['average'] = $values !== [] ? array_sum($values) / count($values) : null;
                    $s['counts']  = array_replace(array_fill_keys(range(1, 5), 0), array_count_values(array_map('intval', $values)));
                    break;
                case 'nps':
                    $n = count($values);
                    $promoters  = count(array_filter($values, static fn ($v) => (int) $v >= 9));
                    $detractors = count(array_filter($values, static fn ($v) => (int) $v <= 6));
                    $s['promoters']  = $promoters;
                    $s['passives']   = $n - $promoters - $detractors;
                    $s['detractors'] = $detractors;
                    $s['nps']        = $n > 0 ? (int) round(100 * ($promoters - $detractors) / $n) : null;
                    break;
                case 'number':
                    $nums = array_map('floatval', $values);
                    $s['average'] = $nums !== [] ? array_sum($nums) / count($nums) : null;
                    $s['total']   = array_sum($nums);
                    break;
                default:
                    $s['latest'] = array_slice($values, 0, 5);
            }
            $out[] = $s;
        }
        return $out;
    }

    /**
     * E-mail the business about a new response (the form's notification address).
     *
     * @param array<string,mixed> $form
     */
    public static function notify(array $form, int $responseId): void
    {
        $to = (string) ($form['notify_email'] ?? '');
        if ($to === '' || !\App\Mail\SmtpMailer::isConfigured()) {
            return;
        }
        try {
            $stmt = Database::connection()->prepare('SELECT answers FROM formelio_responses WHERE id = :id');
            $stmt->execute([':id' => $responseId]);
            $answers = json_decode((string) $stmt->fetchColumn(), true) ?: [];
            $lines   = ['Nouvelle réponse au formulaire « ' . $form['title'] . ' » :', ''];
            foreach ($answers as $a) {
                $lines[] = $a['label'] . ' : ' . (self::display($a['value']) !== '' ? self::display($a['value']) : '—');
            }
            $lines[] = '';
            $lines[] = 'Toutes les réponses : ' . rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/')
                     . '/app.php?m=formelio&p=results&id=' . (int) $form['id'];
            $text = implode("\n", $lines) . "\n";
            \App\Mail\SmtpMailer::fromConfig()->send($to, sprintf(Text::for('fr')['mail_subject'], str_replace(["\r", "\n"], ' ', (string) $form['title'])),
                $text, '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>',
                'Formelio', null);
        } catch (\Throwable $e) {
            error_log('[Formelio mail] ' . $e->getMessage());
        }
    }

    /** Display value of an answer. */
    public static function display(mixed $value): string
    {
        if (is_array($value)) {
            return implode(', ', $value);
        }
        return $value === null ? '' : (string) $value;
    }

    /**
     * @param array<string,mixed>  $f
     * @param array<string,string> $t
     * @return array{0:mixed,1:?string}
     */
    private static function clean(array $f, mixed $raw, array $t): array
    {
        $label = (string) $f['label'];
        $err   = static fn (string $key): array => [null, sprintf($t[$key], $label)];

        if ($f['type'] === 'multi') {
            $picked = array_values(array_unique(array_filter(is_array($raw) ? array_map('strval', $raw) : [], 'strlen')));
            foreach ($picked as $p) {
                if (!in_array($p, $f['options'], true)) {
                    return $err('err_choice');
                }
            }
            if ($picked === [] && $f['required']) {
                return $err('err_required');
            }
            return [$picked, null];
        }

        $v = is_scalar($raw) ? trim((string) $raw) : '';
        if ($v === '') {
            return $f['required'] ? $err('err_required') : [null, null];
        }
        switch ($f['type']) {
            case 'text':
                return mb_strlen($v) > 500 ? $err('err_long') : [$v, null];
            case 'textarea':
                return mb_strlen($v) > 5000 ? $err('err_long') : [$v, null];
            case 'email':
                return filter_var($v, FILTER_VALIDATE_EMAIL) && strlen($v) <= 254 ? [$v, null] : $err('err_email');
            case 'phone':
                $digits = preg_replace('/\D+/', '', $v) ?? '';
                return strlen($digits) >= 7 && strlen($digits) <= 15 && mb_strlen($v) <= 30 ? [$v, null] : $err('err_phone');
            case 'number':
                return preg_match('/^-?\d{1,12}([.,]\d{1,4})?$/', $v) ? [str_replace(',', '.', $v), null] : $err('err_number');
            case 'date':
                return Booking::validDate($v) ? [$v, null] : $err('err_date');
            case 'choice':
                return in_array($v, $f['options'], true) ? [$v, null] : $err('err_choice');
            case 'rating':
                return preg_match('/^[1-5]$/', $v) ? [(int) $v, null] : $err('err_choice');
            case 'nps':
                return preg_match('/^(10|[0-9])$/', $v) ? [(int) $v, null] : $err('err_choice');
        }
        return $err('err_choice');
    }
}
