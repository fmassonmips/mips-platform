<?php
/**
 * Full export of a company's data: a ZIP of CSV files (one per table, UTF-8
 * with BOM, comma separated, as Excel opens them) plus the product and
 * accommodation photos, and a LISEZMOI.txt. For the owner (portability, or
 * before closing the account) and the MIPS team (logged by the caller).
 *
 * Left out: secrets and links that open public pages (passwords, MRA session,
 * tokens), MIPS internal records (login attempts, back-office log, sent
 * notifications) and the other companies' data. Cells starting with = + - @
 * are prefixed with ' so that a spreadsheet does not run them as formulas.
 */
declare(strict_types=1);

namespace App\Suite;

use App\Database;

final class DataExport
{
    /** File => SQL returning the company's rows (:o = organization id). Child tables go through their parent. */
    private const TABLES = [
        'entreprise'                => 'SELECT * FROM organizations WHERE id = :o',
        'equipe'                    => 'SELECT u.name, u.email, ou.role, ou.created_at AS joined_at, u.is_active, u.last_login_at
                                        FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE ou.organization_id = :o',
        'invitations'               => 'SELECT * FROM organization_invitations WHERE organization_id = :o',
        'apps'                      => 'SELECT * FROM organization_modules WHERE organization_id = :o',
        'utilisation'               => 'SELECT u.email, a.day FROM user_activity a JOIN users u ON u.id = a.user_id WHERE a.organization_id = :o ORDER BY a.day',
        'facturo_clients'           => 'SELECT * FROM facturo_clients WHERE organization_id = :o',
        'facturo_documents'         => 'SELECT * FROM facturo_documents WHERE organization_id = :o',
        'facturo_document_lines'    => 'SELECT l.* FROM facturo_document_lines l JOIN facturo_documents d ON d.id = l.document_id WHERE d.organization_id = :o',
        'facturo_document_emails'   => 'SELECT * FROM facturo_document_emails WHERE organization_id = :o',
        'clientbloom_settings'      => 'SELECT * FROM clientbloom_settings WHERE organization_id = :o',
        'clientbloom_customers'     => 'SELECT * FROM clientbloom_customers WHERE organization_id = :o',
        'clientbloom_transactions'  => 'SELECT * FROM clientbloom_transactions WHERE organization_id = :o',
        'clientbloom_notes'         => 'SELECT * FROM clientbloom_notes WHERE organization_id = :o',
        'rendezvous_settings'       => 'SELECT * FROM rendezvous_settings WHERE organization_id = :o',
        'rendezvous_services'       => 'SELECT * FROM rendezvous_services WHERE organization_id = :o',
        'rendezvous_staff'          => 'SELECT * FROM rendezvous_staff WHERE organization_id = :o',
        'rendezvous_hours'          => 'SELECT h.* FROM rendezvous_hours h JOIN rendezvous_staff s ON s.id = h.staff_id WHERE s.organization_id = :o',
        'rendezvous_appointments'   => 'SELECT * FROM rendezvous_appointments WHERE organization_id = :o',
        'formelio_forms'            => 'SELECT * FROM formelio_forms WHERE organization_id = :o',
        'formelio_responses'        => 'SELECT * FROM formelio_responses WHERE organization_id = :o',
        'flowdesk_settings'         => 'SELECT * FROM flowdesk_settings WHERE organization_id = :o',
        'flowdesk_tickets'          => 'SELECT * FROM flowdesk_tickets WHERE organization_id = :o',
        'flowdesk_messages'         => 'SELECT m.* FROM flowdesk_messages m JOIN flowdesk_tickets t ON t.id = m.ticket_id WHERE t.organization_id = :o',
        'teamnest_projects'         => 'SELECT * FROM teamnest_projects WHERE organization_id = :o',
        'teamnest_tasks'            => 'SELECT * FROM teamnest_tasks WHERE organization_id = :o',
        'teamnest_time'             => 'SELECT e.* FROM teamnest_time e JOIN teamnest_tasks t ON t.id = e.task_id WHERE t.organization_id = :o',
        'shoplokal_settings'        => 'SELECT * FROM shoplokal_settings WHERE organization_id = :o',
        'shoplokal_products'        => 'SELECT * FROM shoplokal_products WHERE organization_id = :o',
        'shoplokal_orders'          => 'SELECT * FROM shoplokal_orders WHERE organization_id = :o',
        'shoplokal_order_lines'     => 'SELECT l.* FROM shoplokal_order_lines l JOIN shoplokal_orders o ON o.id = l.order_id WHERE o.organization_id = :o',
        'staffzen_settings'         => 'SELECT * FROM staffzen_settings WHERE organization_id = :o',
        'staffzen_leave_types'      => 'SELECT * FROM staffzen_leave_types WHERE organization_id = :o',
        'staffzen_allowances'       => 'SELECT a.* FROM staffzen_allowances a JOIN staffzen_leave_types t ON t.id = a.type_id WHERE t.organization_id = :o',
        'staffzen_holidays'         => 'SELECT * FROM staffzen_holidays WHERE organization_id = :o',
        'staffzen_requests'         => 'SELECT * FROM staffzen_requests WHERE organization_id = :o',
        'bookora_settings'          => 'SELECT * FROM bookora_settings WHERE organization_id = :o',
        'bookora_units'             => 'SELECT * FROM bookora_units WHERE organization_id = :o',
        'bookora_seasons'           => 'SELECT s.* FROM bookora_seasons s JOIN bookora_units u ON u.id = s.unit_id WHERE u.organization_id = :o',
        'bookora_blocks'            => 'SELECT b.* FROM bookora_blocks b JOIN bookora_units u ON u.id = b.unit_id WHERE u.organization_id = :o',
        'bookora_bookings'          => 'SELECT * FROM bookora_bookings WHERE organization_id = :o',
        'bookora_booking_lines'     => 'SELECT l.* FROM bookora_booking_lines l JOIN bookora_bookings b ON b.id = l.booking_id WHERE b.organization_id = :o',
    ];

    /** Columns never exported: secrets, and tokens that open public pages. */
    private const SECRET = '/(^|_)(token|token_hash|password_hash|mra_password_enc|session_key_enc)$/';

    /** Tables whose "image" column holds a photo (data URL), written as a file. */
    private const IMAGES = ['shoplokal_products' => 'produits', 'bookora_units' => 'logements'];

    /**
     * Build the ZIP in a temporary file and return its path (the caller sends then deletes it).
     */
    public static function zip(int $orgId): string
    {
        $path = tempnam(sys_get_temp_dir(), 'mips-export-');
        $zip  = new \ZipArchive();
        if ($path === false || $zip->open($path, \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Impossible de créer le fichier d’export.');
        }
        $pdo    = Database::connection();
        $counts = [];
        foreach (self::TABLES as $file => $sql) {
            $stmt = $pdo->prepare($sql);
            $stmt->execute([':o' => $orgId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $counts[$file] = count($rows);
            $zip->addFromString($file . '.csv', self::csv($file, $rows, $zip));
        }
        $zip->addFromString('LISEZMOI.txt', self::readme($orgId, $counts));
        $zip->close();
        return $path;
    }

    /** File name offered to the browser. */
    public static function filename(int $orgId): string
    {
        $name = Tenant::profile($orgId)['name'];
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: '')) ?? '', '-');
        return 'mips-export-' . ($slug !== '' ? $slug : (string) $orgId) . '-' . date('Y-m-d') . '.zip';
    }

    /**
     * @param list<array<string,mixed>> $rows
     */
    private static function csv(string $file, array $rows, \ZipArchive $zip): string
    {
        $out = fopen('php://temp', 'r+');
        fwrite($out, "\xEF\xBB\xBF");   // UTF-8 BOM so Excel reads accents correctly
        $columns = null;
        foreach ($rows as $row) {
            if (isset(self::IMAGES[$file]) && is_string($row['image'] ?? null) && $row['image'] !== '') {
                $row['image'] = self::image($zip, self::IMAGES[$file], (int) $row['id'], $row['image']);
            }
            $row = array_filter($row, static fn (string $col): bool => !preg_match(self::SECRET, $col), ARRAY_FILTER_USE_KEY);
            if ($columns === null) {
                $columns = array_keys($row);
                fputcsv($out, $columns, ',', '"', '');
            }
            fputcsv($out, array_map([self::class, 'cell'], array_values($row)), ',', '"', '');
        }
        if ($columns === null) {
            fwrite($out, "(aucune donnée)\r\n");
        }
        rewind($out);
        $csv = (string) stream_get_contents($out);
        fclose($out);
        return $csv;
    }

    private static function cell(mixed $v): string
    {
        $v = (string) ($v ?? '');
        return preg_match('/^[=+\-@\t\r]/', $v) && !is_numeric($v) ? "'" . $v : $v;
    }

    /** Photo stored as a data URL → images/<folder>/<id>.<ext>; returns the file name for the CSV. */
    private static function image(\ZipArchive $zip, string $folder, int $id, string $dataUrl): string
    {
        if (!preg_match('#^data:image/(jpeg|png|webp);base64,(.+)$#', $dataUrl, $m)) {
            return '';
        }
        $name = 'images/' . $folder . '/' . $id . '.' . ($m[1] === 'jpeg' ? 'jpg' : $m[1]);
        $zip->addFromString($name, (string) base64_decode($m[2], true));
        return $name;
    }

    /**
     * @param array<string,int> $counts
     */
    private static function readme(int $orgId, array $counts): string
    {
        $profile = Tenant::profile($orgId);
        $lines = [];
        foreach ($counts as $file => $n) {
            $lines[] = sprintf('  %-28s %d ligne%s', $file . '.csv', $n, $n > 1 ? 's' : '');
        }
        return 'Export des données de ' . $profile['name'] . ($profile['legal_name'] !== '' ? ' (' . $profile['legal_name'] . ')' : '') . "\r\n"
            . 'Réalisé le ' . date('d/m/Y à H:i') . " depuis my.mips.mu\r\n\r\n"
            . "Un fichier CSV par type de données (UTF-8, séparateur virgule : ouvrez-les avec Excel ou Google Sheets).\r\n"
            . "Les montants sont en cents (12345 = Rs 123,45) ; les dates au format AAAA-MM-JJ.\r\n"
            . "Les photos des produits et des logements sont dans le dossier images/.\r\n"
            . "Les factures émises sont dans facturo_documents (en-têtes) et facturo_document_lines (lignes) :\r\n"
            . "conservez-les, la loi vous oblige à garder vos pièces comptables.\r\n"
            . "Ne figurent pas dans l'export : les mots de passe, les identifiants MRA et les liens privés des pages publiques.\r\n\r\n"
            . implode("\r\n", $lines) . "\r\n";
    }
}
