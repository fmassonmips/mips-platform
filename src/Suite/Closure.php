<?php
/**
 * Closing a company's account at the owner's request.
 *
 * The request (password and company name typed again) closes the company at
 * once: apps and public pages close, members are logged out, nothing else is
 * sent. Only the owner can still log in, to download the data or cancel.
 * After DELAY_DAYS the data is deleted for good (tools/purge_companies.php),
 * with the accounts that belonged to no other company. The MIPS team can
 * cancel from the back-office; the back-office log keeps a line.
 */
declare(strict_types=1);

namespace App\Suite;

use App\Backoffice\Log;
use App\Database;
use App\Format;
use App\Mail\SmtpMailer;

final class Closure
{
    public const DELAY_DAYS = 30;

    /**
     * Child tables first: the RESTRICT links (booking → unit, appointment →
     * service, invoice → client…) never block the deletion.
     */
    private const DELETE_ORDER = [
        'bookora_booking_lines'   => 'DELETE l FROM bookora_booking_lines l JOIN bookora_bookings b ON b.id = l.booking_id WHERE b.organization_id = :o',
        'bookora_bookings'        => 'DELETE FROM bookora_bookings WHERE organization_id = :o',
        'bookora_blocks'          => 'DELETE b FROM bookora_blocks b JOIN bookora_units u ON u.id = b.unit_id WHERE u.organization_id = :o',
        'bookora_seasons'         => 'DELETE s FROM bookora_seasons s JOIN bookora_units u ON u.id = s.unit_id WHERE u.organization_id = :o',
        'bookora_units'           => 'DELETE FROM bookora_units WHERE organization_id = :o',
        'rendezvous_appointments' => 'DELETE FROM rendezvous_appointments WHERE organization_id = :o',
        'rendezvous_settings'     => 'DELETE FROM rendezvous_settings WHERE organization_id = :o',
        'staffzen_requests'       => 'DELETE FROM staffzen_requests WHERE organization_id = :o',
        'teamnest_time'           => 'DELETE e FROM teamnest_time e JOIN teamnest_tasks t ON t.id = e.task_id WHERE t.organization_id = :o',
        'teamnest_tasks'          => 'DELETE FROM teamnest_tasks WHERE organization_id = :o',
        'teamnest_projects'       => 'DELETE FROM teamnest_projects WHERE organization_id = :o',
        'shoplokal_orders'        => 'DELETE FROM shoplokal_orders WHERE organization_id = :o',
        'facturo_documents'       => 'DELETE FROM facturo_documents WHERE organization_id = :o',
    ];

    /**
     * @param array<string,mixed> $user the owner, as logged in
     * @param array{id:int,name:string,role:string} $org
     * @return ?string error
     */
    public static function request(array $user, array $org, string $password, string $typedName): ?string
    {
        if ($org['role'] !== 'owner') {
            return 'Seul le propriétaire peut fermer le compte de l’entreprise.';
        }
        $stmt = Database::connection()->prepare('SELECT password_hash FROM users WHERE id = :id');
        $stmt->execute([':id' => (int) $user['id']]);
        if (!password_verify($password, (string) $stmt->fetchColumn())) {
            return 'Mot de passe incorrect.';
        }
        if (mb_strtolower(trim($typedName)) !== mb_strtolower(trim($org['name']))) {
            return 'Tapez exactement le nom de l’entreprise : « ' . $org['name'] . ' ».';
        }
        $upd = Database::connection()->prepare(
            'UPDATE organizations SET deletion_scheduled_at = NOW() + INTERVAL ' . self::DELAY_DAYS . ' DAY WHERE id = :o AND deletion_scheduled_at IS NULL'
        );
        $upd->execute([':o' => $org['id']]);
        if ($upd->rowCount() !== 1) {
            return 'La fermeture est déjà demandée.';
        }
        $when = (string) self::scheduledAt($org['id']);
        self::mail((string) $user['email'], 'Fermeture de votre compte MIPS : ' . $org['name'],
            "Bonjour,\n\nVous avez demandé la fermeture du compte de " . $org['name'] . " sur MIPS. Les apps et vos pages publiques sont fermées, "
            . "les autres membres n'ont plus accès.\n\nToutes les données seront supprimées définitivement le " . Format::dateTime($when) . ".\n"
            . "D'ici là, connectez-vous pour télécharger vos données (conservez vos factures : la loi vous oblige à garder vos pièces comptables) "
            . "ou pour annuler la fermeture :\n" . self::url('/data.php') . "\n\nSi vous n'avez rien demandé, connectez-vous tout de suite et annulez, puis changez votre mot de passe.\n\nL’équipe MIPS\n");
        return null;
    }

    public static function cancel(int $orgId): ?string
    {
        $upd = Database::connection()->prepare('UPDATE organizations SET deletion_scheduled_at = NULL WHERE id = :o AND deletion_scheduled_at IS NOT NULL');
        $upd->execute([':o' => $orgId]);
        return $upd->rowCount() === 1 ? null : 'Aucune fermeture en cours.';
    }

    public static function scheduledAt(int $orgId): ?string
    {
        $stmt = Database::connection()->prepare('SELECT deletion_scheduled_at FROM organizations WHERE id = :o');
        $stmt->execute([':o' => $orgId]);
        $v = $stmt->fetchColumn();
        return is_string($v) ? $v : null;
    }

    /**
     * Delete one company and the accounts that belong to no other one.
     */
    public static function purge(int $orgId): void
    {
        $pdo     = Database::connection();
        $profile = Tenant::profile($orgId);
        $owners  = $pdo->prepare('SELECT u.email FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE ou.organization_id = :o AND ou.role = \'owner\'');
        $owners->execute([':o' => $orgId]);
        $ownerEmails = array_map('strval', $owners->fetchAll(\PDO::FETCH_COLUMN));
        $users = $pdo->prepare(
            'SELECT ou.user_id FROM organization_users ou
             WHERE ou.organization_id = :o
               AND NOT EXISTS (SELECT 1 FROM organization_users x WHERE x.user_id = ou.user_id AND x.organization_id <> :o2)'
        );
        $users->execute([':o' => $orgId, ':o2' => $orgId]);
        $userIds = array_map('intval', $users->fetchAll(\PDO::FETCH_COLUMN));

        $pdo->beginTransaction();
        try {
            foreach (self::DELETE_ORDER as $sql) {
                $pdo->prepare($sql)->execute([':o' => $orgId]);
            }
            $pdo->prepare('DELETE FROM organizations WHERE id = :o')->execute([':o' => $orgId]);   // the rest cascades
            if ($userIds !== []) {
                $in = implode(',', $userIds);   // integers from the database
                $pdo->exec("DELETE FROM login_attempts WHERE email IN (SELECT email FROM users WHERE id IN ($in))");
                $pdo->exec("DELETE FROM users WHERE id IN ($in)");
            }
            Log::add(null, null, 'purge', $profile['name'] . ' (#' . $orgId . ') : données supprimées à la demande du propriétaire, ' . count($userIds) . ' compte(s) supprimé(s).');
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        foreach ($ownerEmails as $email) {
            self::mail($email, 'Votre compte MIPS est supprimé',
                "Bonjour,\n\nComme demandé, le compte de " . $profile['name'] . " et toutes ses données ont été supprimés de MIPS.\n\n"
                . "Merci d'avoir utilisé MIPS. Pour revenir, il suffit de créer un nouveau compte.\n\nL’équipe MIPS\n");
        }
    }

    private static function mail(string $to, string $subject, string $text): void
    {
        if (!SmtpMailer::isConfigured()) {
            return;
        }
        try {
            SmtpMailer::fromConfig()->send($to, $subject, $text,
                '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>', 'MIPS', null);
        } catch (\Throwable $e) {
            error_log('[Closure mail] ' . $e->getMessage());
        }
    }

    private static function url(string $path): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . $path;
    }
}
