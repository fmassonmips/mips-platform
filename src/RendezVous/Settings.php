<?php
/**
 * Per-organization online booking rules. The row (and the public booking
 * link token) is created on first read.
 */
declare(strict_types=1);

namespace App\RendezVous;

use App\Database;

final class Settings
{
    /** Allowed slot steps, in minutes. */
    public const STEPS = [5, 10, 15, 20, 30, 60];

    /**
     * @return array{public_token:string,booking_enabled:bool,slot_step_min:int,min_notice_min:int,
     *               max_days_ahead:int,cancel_notice_min:int,notify_email:string,intro:string,survey_form_id:?int}
     */
    public static function get(int $orgId): array
    {
        $pdo = Database::connection();
        $pdo->prepare('INSERT IGNORE INTO rendezvous_settings (organization_id, public_token) VALUES (:oid, :t)')
            ->execute([':oid' => $orgId, ':t' => bin2hex(random_bytes(16))]);
        $stmt = $pdo->prepare('SELECT * FROM rendezvous_settings WHERE organization_id = :oid');
        $stmt->execute([':oid' => $orgId]);
        $row = $stmt->fetch();
        return [
            'public_token'      => (string) $row['public_token'],
            'booking_enabled'   => (int) $row['booking_enabled'] === 1,
            'slot_step_min'     => (int) $row['slot_step_min'],
            'min_notice_min'    => (int) $row['min_notice_min'],
            'max_days_ahead'    => (int) $row['max_days_ahead'],
            'cancel_notice_min' => (int) $row['cancel_notice_min'],
            'notify_email'      => (string) ($row['notify_email'] ?? ''),
            'intro'             => (string) ($row['intro'] ?? ''),
            'survey_form_id'    => $row['survey_form_id'] !== null ? (int) $row['survey_form_id'] : null,
        ];
    }

    /** Organization id behind a public booking link, or null. */
    public static function orgByToken(string $token): ?int
    {
        if (!preg_match('/^[0-9a-f]{32}$/', $token)) {
            return null;
        }
        $stmt = Database::connection()->prepare('SELECT organization_id FROM rendezvous_settings WHERE public_token = :t');
        $stmt->execute([':t' => $token]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /**
     * @param array<string,mixed> $in
     */
    public static function save(int $orgId, array $in): ?string
    {
        $step   = (int) ($in['slot_step_min'] ?? 15);
        $notice = (int) ($in['min_notice_min'] ?? 0);
        $days   = (int) ($in['max_days_ahead'] ?? 60);
        $cancel = (int) ($in['cancel_notice_min'] ?? 0);
        $email  = trim((string) ($in['notify_email'] ?? ''));
        $intro  = trim((string) ($in['intro'] ?? ''));
        if (!in_array($step, self::STEPS, true)) {
            return 'Intervalle entre deux horaires invalide.';
        }
        if ($notice < 0 || $notice > 20160 || $cancel < 0 || $cancel > 20160) {
            return 'Les délais doivent être compris entre 0 et 14 jours.';
        }
        if ($days < 1 || $days > 365) {
            return 'La réservation à l\'avance doit être comprise entre 1 et 365 jours.';
        }
        if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254)) {
            return 'E-mail de notification invalide.';
        }
        if (mb_strlen($intro) > 500) {
            return 'Le message d\'accueil est trop long (500 caractères max.).';
        }
        $survey = (int) ($in['survey_form_id'] ?? -1);
        if ($survey === -1) {
            $survey = (int) self::get($orgId)['survey_form_id'];
        }
        if ($survey > 0 && \App\Formelio\Forms::find($orgId, $survey) === null) {
            return 'Formulaire de satisfaction introuvable.';
        }
        self::get($orgId);
        Database::connection()->prepare(
            'UPDATE rendezvous_settings
             SET booking_enabled = :en, slot_step_min = :step, min_notice_min = :notice, max_days_ahead = :days,
                 cancel_notice_min = :cancel, notify_email = :email, intro = :intro, survey_form_id = :survey
             WHERE organization_id = :oid'
        )->execute([
            ':en' => !empty($in['booking_enabled']) ? 1 : 0, ':step' => $step, ':notice' => $notice, ':days' => $days,
            ':cancel' => $cancel, ':email' => $email !== '' ? $email : null, ':intro' => $intro !== '' ? $intro : null,
            ':survey' => $survey > 0 ? $survey : null, ':oid' => $orgId,
        ]);
        return null;
    }

    /** New booking link; the old one stops working. */
    public static function regenerateToken(int $orgId): void
    {
        self::get($orgId);
        Database::connection()->prepare('UPDATE rendezvous_settings SET public_token = :t WHERE organization_id = :oid')
            ->execute([':t' => bin2hex(random_bytes(16)), ':oid' => $orgId]);
    }
}
