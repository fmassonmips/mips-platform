<?php
/**
 * Monday summary e-mail to the owner and administrators: last week (Monday to
 * Sunday) and what is waiting now, for the apps the company uses, with the
 * same figures as BizPilot (App\BizPilot\Dashboard). Sent once per person and
 * week by tools/reminders.php on Mondays; nothing when nothing happened and
 * nothing is waiting. Anyone can turn it off: dashboard, or the one-click
 * link in the e-mail (signed with app.secret_key, no login needed).
 */
declare(strict_types=1);

namespace App\BizPilot;

use App\BizPilot\Dashboard as D;
use App\Database;
use App\Facturo\Money;
use App\Format;
use App\Mail\SmtpMailer;
use App\RendezVous\Booking;
use App\Suite\Modules;
use App\Suite\Notifications;
use App\Suite\Tenant;

final class Digest
{
    /**
     * Send this week's summaries (on any day when $force, for tests and catch-up).
     * Returns [sent, failed].
     *
     * @return array{0:int,1:int}
     */
    public static function run(bool $force = false): array
    {
        $today = Booking::now();
        if (!SmtpMailer::isConfigured() || (!$force && $today->format('N') !== '1')) {
            return [0, 0];
        }
        $monday = $today->modify('monday this week')->format('Y-m-d');
        $rows = Database::connection()->query(
            'SELECT o.id AS org_id, u.id AS user_id, u.email, u.name
             FROM organizations o
             JOIN organization_users ou ON ou.organization_id = o.id AND ou.role IN (\'owner\', \'admin\')
             JOIN users u ON u.id = ou.user_id AND u.is_active = 1 AND u.digest_opt_out = 0
             WHERE o.suspended_at IS NULL AND o.deletion_scheduled_at IS NULL
             ORDER BY o.id'
        )->fetchAll();
        $sent = 0;
        $failed = 0;
        $built = [];
        foreach ($rows as $r) {
            $orgId = (int) $r['org_id'];
            $built[$orgId] ??= self::build($orgId, $monday);
            if ($built[$orgId] === null || !Notifications::claim($orgId, 'digest', $r['user_id'] . '@' . $monday)) {
                continue;   // nothing to say, or already sent this week
            }
            try {
                self::send($built[$orgId], (int) $r['user_id'], (string) $r['email']);
                $sent++;
            } catch (\Throwable $e) {
                error_log('[Digest] ' . $orgId . ': ' . $e->getMessage());
                Notifications::release($orgId, 'digest', $r['user_id'] . '@' . $monday);
                $failed++;
            }
        }
        return [$sent, $failed];
    }

    /**
     * The week's sections and to-do list, or null when there is nothing to tell.
     *
     * @return array{org:string,week:string,sections:array<string,list<string>>,todo:list<array{0:string,1:string}>,bizpilot:bool}|null
     */
    public static function build(int $orgId, string $monday): ?array
    {
        $from = (new \DateTimeImmutable($monday))->modify('-7 days')->format('Y-m-d');
        $to   = $monday;
        $next = (new \DateTimeImmutable($monday))->modify('+7 days')->format('Y-m-d');
        $on   = static fn (string $slug): bool => Modules::isReadable($orgId, $slug);
        $rs   = static fn (int $c): string => Money::format($c, 'MUR');
        $sections = [];
        $todo = [];

        if ($on('facturo')) {
            $f = D::facturo($orgId, $from, $to);
            $r = D::receivables($orgId);
            $lines = [];
            if ($f['invoices'] > 0 || $f['collected_cents'] > 0) {
                $lines[] = 'Facturé : ' . $rs($f['invoiced_cents']) . ' (' . $f['invoices'] . ' facture' . ($f['invoices'] > 1 ? 's' : '') . ') · encaissé : ' . $rs($f['collected_cents']);
            }
            if ($r['unpaid'] > 0) {
                $lines[] = 'À encaisser : ' . $rs($r['unpaid_cents']) . ($r['overdue'] > 0 ? ', dont ' . $rs($r['overdue_cents']) . ' en retard (' . $r['overdue'] . ' facture' . ($r['overdue'] > 1 ? 's' : '') . ')' : '');
            }
            if ($lines !== []) {
                $sections['Factures'] = $lines;
            }
            if ($r['overdue'] > 0) {
                $todo[] = ['Relancer ' . $r['overdue'] . ' facture(s) en retard', '/app.php?m=facturo&p=invoices'];
            }
            if ($r['stale'] > 0) {
                $todo[] = ['Relancer ' . $r['stale'] . ' devis sans réponse depuis plus de ' . D::QUOTE_FOLLOW_UP_DAYS . ' jours', '/app.php?m=facturo&p=quotes'];
            }
        }
        if ($on('shoplokal')) {
            $s = \App\ShopLokal\Orders::sales($orgId, $from, $to);
            if ($s['orders'] > 0) {
                $sections['Boutique en ligne'] = [$s['orders'] . ' commande' . ($s['orders'] > 1 ? 's' : '') . ' · ' . $rs($s['revenue_cents']) . ' TTC'];
            }
            $c = \App\ShopLokal\Orders::counts($orgId);
            if ($c['new'] > 0) {
                $todo[] = ['Confirmer ' . $c['new'] . ' commande(s) en ligne', '/app.php?m=shoplokal'];
            }
        }
        if ($on('rendezvous')) {
            $a = D::rendezvous($orgId, $from, $to);
            $n = D::rendezvous($orgId, $to, $next);
            $lines = [];
            if ($a['appointments'] > 0) {
                $lines[] = 'Semaine passée : ' . $a['appointments'] . ' rendez-vous, ' . $a['done'] . ' honoré(s)' . ($a['no_show'] > 0 ? ', ' . $a['no_show'] . ' absent(s)' : '');
            }
            if ($n['appointments'] > 0) {
                $lines[] = 'Cette semaine : ' . $n['appointments'] . ' rendez-vous prévu(s)';
            }
            if ($lines !== []) {
                $sections['Rendez-vous'] = $lines;
            }
        }
        if ($on('bookora')) {
            $b = \App\Bookora\Bookings::monthStats($orgId, $from, $to);
            if ($b['nights'] > 0) {
                $sections['Hébergement'] = [$b['nights'] . ' nuit' . ($b['nights'] > 1 ? 's' : '') . ' vendue(s) sur ' . $b['available'] . ' · ' . $rs($b['revenue_cents']) . ' TTC'];
            }
            $c = \App\Bookora\Bookings::counts($orgId);
            if ($c['todo'] > 0) {
                $todo[] = ['Confirmer ' . $c['todo'] . ' demande(s) de réservation', '/app.php?m=bookora&p=bookings&f=todo'];
            }
        }
        if ($on('clientbloom')) {
            $c = D::clientbloom($orgId, $from, $to);
            if ($c['sales_cents'] > 0 || $c['new_customers'] > 0) {
                $sections['Fidélité'] = ['Ventes à la caisse : ' . $rs($c['sales_cents']) . ' · ' . $c['new_customers'] . ' nouveau(x) client(s)'];
            }
        }
        if ($on('flowdesk')) {
            $s = D::flowdesk($orgId, $from, $to);
            $q = D::supportQueue($orgId);
            if ((int) $s['created'] > 0) {
                $sections['Support'] = [(int) $s['created'] . ' ticket(s) reçu(s), ' . (int) $s['resolved'] . ' résolu(s)'];
            }
            if ($q['unanswered'] > 0) {
                $todo[] = ['Répondre à ' . $q['unanswered'] . ' ticket(s) sans réponse', '/app.php?m=flowdesk'];
            }
        }
        if ($on('formelio')) {
            $f = D::formelio($orgId, $from, $to);
            if ($f['responses'] > 0) {
                $sections['Formulaires'] = [$f['responses'] . ' réponse(s)' . ($f['nps'] !== null ? ' · NPS ' . $f['nps'] : '')];
            }
        }
        if ($on('staffzen') && ($p = \App\StaffZen\Leaves::pendingCount($orgId)) > 0) {
            $todo[] = ['Valider ' . $p . ' demande(s) de congé', '/app.php?m=staffzen&p=approvals'];
        }
        if ($on('teamnest') && ($l = \App\TeamNest\Tasks::overdueCount($orgId)) > 0) {
            $todo[] = [$l . ' tâche(s) en retard dans les projets', '/app.php?m=teamnest'];
        }
        if ($sections === [] && $todo === []) {
            return null;
        }
        return [
            'org'      => Tenant::profile($orgId)['name'],
            'week'     => 'du ' . Format::date($from) . ' au ' . Format::date((new \DateTimeImmutable($to))->modify('-1 day')->format('Y-m-d')),
            'sections' => $sections,
            'todo'     => $todo,
            'bizpilot' => Modules::isReadable($orgId, 'bizpilot'),
        ];
    }

    /** One-click unsubscribe link of a user (empty without app.secret_key). */
    public static function unsubscribeUrl(int $userId): string
    {
        $sig = self::signature($userId);
        return $sig === null ? '' : self::url('/digest.php?u=' . $userId . '&s=' . $sig);
    }

    public static function checkSignature(int $userId, string $sig): bool
    {
        $expected = self::signature($userId);
        return $expected !== null && hash_equals($expected, $sig);
    }

    public static function setOptOut(int $userId, bool $out): void
    {
        Database::connection()->prepare('UPDATE users SET digest_opt_out = :o WHERE id = :id')->execute([':o' => $out ? 1 : 0, ':id' => $userId]);
    }

    private static function signature(int $userId): ?string
    {
        $key = base64_decode((string) ($GLOBALS['config']['app']['secret_key'] ?? ''), true);
        return $key === false || strlen($key) < 16 ? null : substr(hash_hmac('sha256', 'digest-unsubscribe|' . $userId, $key), 0, 32);
    }

    /**
     * @param array{org:string,week:string,sections:array<string,list<string>>,todo:list<array{0:string,1:string}>,bizpilot:bool} $d
     */
    private static function send(array $d, int $userId, string $to): void
    {
        $e = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
        $text = "Bonjour,\n\nVoici la semaine de " . $d['org'] . ' (' . $d['week'] . ").\n";
        $html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1f24;max-width:560px">'
              . '<p>Bonjour,</p><p>Voici la semaine de <strong>' . $e($d['org']) . '</strong> (' . $e($d['week']) . ').</p>';
        if ($d['todo'] !== []) {
            $text .= "\nÀ faire maintenant :\n";
            $html .= '<h3 style="font-size:16px;margin:20px 0 6px">À faire maintenant</h3><ul style="padding-left:20px;margin:0">';
            foreach ($d['todo'] as [$label, $path]) {
                $text .= '- ' . $label . ' : ' . self::url($path) . "\n";
                $html .= '<li><a href="' . $e(self::url($path)) . '" style="color:#2b6cb0">' . $e($label) . '</a></li>';
            }
            $html .= '</ul>';
        }
        foreach ($d['sections'] as $title => $lines) {
            $text .= "\n" . $title . " :\n- " . implode("\n- ", $lines) . "\n";
            $html .= '<h3 style="font-size:16px;margin:20px 0 6px">' . $e($title) . '</h3><ul style="padding-left:20px;margin:0">'
                   . implode('', array_map(static fn (string $l): string => '<li>' . $e($l) . '</li>', $lines)) . '</ul>';
        }
        $more = self::url($d['bizpilot'] ? '/app.php?m=bizpilot' : '/dashboard.php');
        $text .= "\n" . ($d['bizpilot'] ? 'Le détail dans BizPilot' : 'Votre tableau de bord') . ' : ' . $more . "\n";
        $html .= '<p style="margin:24px 0"><a href="' . $e($more) . '" style="background:#2b6cb0;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">'
               . ($d['bizpilot'] ? 'Voir le détail dans BizPilot' : 'Ouvrir le tableau de bord') . '</a></p>';
        $stop = self::unsubscribeUrl($userId);
        if ($stop !== '') {
            $text .= "\nNe plus recevoir ce résumé : " . $stop . "\n";
            $html .= '<p style="font-size:12px;color:#6b7280">Résumé envoyé chaque lundi au propriétaire et aux administrateurs. <a href="' . $e($stop) . '" style="color:#6b7280">Ne plus le recevoir</a></p>';
        }
        $html .= '</div>';
        SmtpMailer::fromConfig()->send($to, 'Votre semaine : ' . str_replace(["\r", "\n"], ' ', $d['org']) . ' (' . $d['week'] . ')', $text, $html, 'MIPS', null);
    }

    private static function url(string $path): string
    {
        return rtrim((string) ($GLOBALS['config']['app']['url'] ?? ''), '/') . $path;
    }
}
