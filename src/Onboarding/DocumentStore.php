<?php
/**
 * Stores a KYC document uploaded by staff or by the merchant (portal):
 * format checked on the content, random name outside the web root, sha256,
 * optional antivirus (config portal.antivirus_command).
 */
declare(strict_types=1);

namespace App\Onboarding;

use App\Database;
use RuntimeException;

final class DocumentStore
{
    public const MIME_EXT = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png'];

    /**
     * @param array<string,mixed> $case
     * @param array<string,mixed> $file one entry of $_FILES
     * @param bool $requireScan refuse the upload when no antivirus is configured
     * @return array{id:int, sha256:string, scan_status:string}
     */
    public function store(array $case, string $requirement, ?int $partyId, ?string $expires, array $file,
                          ?int $staffId, ?int $portalUserId, bool $requireScan): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
            throw new RuntimeException('No file received (or too large for the server).', 422);
        }
        $max = (int) ($GLOBALS['config']['kyc']['max_document_bytes'] ?? 0);
        if ($max > 0 && (int) $file['size'] > $max) {
            throw new RuntimeException('File too large (maximum ' . intdiv($max, 1024 * 1024) . ' MB).', 422);
        }
        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
        if (!isset(self::MIME_EXT[$mime])) {
            throw new RuntimeException('Accepted formats: PDF, JPEG, PNG.', 422);
        }

        $scanner = $GLOBALS['config']['portal']['antivirus_command'] ?? null;
        if ($requireScan && empty($scanner)) {
            error_log('[KYC] portal upload refused: portal.require_antivirus is on but no antivirus_command is configured');
            throw new RuntimeException('Document upload is temporarily unavailable. Please try again later or contact MIPS.', 503);
        }
        $scanStatus = 'not_scanned';
        if (!empty($scanner)) {
            $result = self::scan((array) $scanner, (string) $file['tmp_name']);
            if ($result === 'infected') {
                @unlink((string) $file['tmp_name']);
                throw new RuntimeException('The file was rejected by the antivirus check.', 422);
            }
            if ($result !== 'clean') {
                throw new RuntimeException('The file could not be checked by the antivirus. Please try again later.', 503);
            }
            $scanStatus = 'clean';
        }

        $rel  = 'kyc/' . $case['id'] . '/' . bin2hex(random_bytes(16)) . '.' . self::MIME_EXT[$mime];
        $dest = rtrim((string) $GLOBALS['config']['storage']['path'], '/') . '/' . $rel;
        if ((!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0750, true) && !is_dir(dirname($dest)))
            || !move_uploaded_file((string) $file['tmp_name'], $dest)) {
            error_log('[KYC] cannot write ' . $dest);
            throw new RuntimeException('Document storage is not writable. Contact an administrator.', 500);
        }
        $sha = (string) hash_file('sha256', $dest);

        $db = Database::connection();
        $db->prepare(
            'INSERT INTO kyc_documents (case_id, requirement, party_id, path, original_name, mime, size, sha256, scan_status,
                expires_at, uploaded_by, uploaded_by_portal)
             VALUES (:c, :r, :p, :path, :n, :mime, :size, :sha, :scan, :exp, :u, :pu)'
        )->execute([
            ':c' => $case['id'], ':r' => $requirement, ':p' => $partyId, ':path' => $rel,
            ':n' => mb_substr(basename((string) $file['name']), 0, 255), ':mime' => $mime, ':size' => (int) filesize($dest),
            ':sha' => $sha, ':scan' => $scanStatus, ':exp' => $expires, ':u' => $staffId, ':pu' => $portalUserId,
        ]);
        return ['id' => (int) $db->lastInsertId(), 'sha256' => $sha, 'scan_status' => $scanStatus];
    }

    /** Delete a document row, and its file unless another case shares it. */
    public function delete(array $doc): void
    {
        $db = Database::connection();
        $db->prepare('DELETE FROM kyc_documents WHERE id = :id')->execute([':id' => $doc['id']]);
        $shared = $db->prepare('SELECT 1 FROM kyc_documents WHERE path = :p LIMIT 1');
        $shared->execute([':p' => $doc['path']]);
        if ($shared->fetchColumn() === false) {
            @unlink(rtrim((string) $GLOBALS['config']['storage']['path'], '/') . '/' . $doc['path']);
        }
    }

    /**
     * Run the configured scanner on a file (no shell involved).
     * Exit code 0 = clean, 1 = infected, anything else = error.
     *
     * @param list<string> $command
     */
    private static function scan(array $command, string $path): string
    {
        $proc = @proc_open(array_merge(array_map('strval', $command), [$path]), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($proc)) {
            error_log('[KYC] antivirus could not be started');
            return 'error';
        }
        $out = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $code = proc_close($proc);
        if ($code === 1) {
            return 'infected';
        }
        if ($code !== 0) {
            error_log('[KYC] antivirus error (exit ' . $code . '): ' . mb_substr(trim((string) $out), 0, 300));
            return 'error';
        }
        return 'clean';
    }
}
