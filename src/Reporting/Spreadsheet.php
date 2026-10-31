<?php
/**
 * Row reader for uploaded .xlsx / .csv files, shared by the Commission_Data
 * import and the bank reconciliation.
 */
declare(strict_types=1);

namespace App\Reporting;

use RuntimeException;

final class Spreadsheet
{
    /**
     * Rows as lists of strings. Picks the parser from the client filename.
     *
     * @return \Generator<int, list<string>>
     */
    public static function rows(string $path, string $filename): \Generator
    {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if ($ext === 'xlsx') {
            return XlsxReader::rows($path);
        }
        if ($ext === 'csv') {
            return self::csvRows($path);
        }
        throw new RuntimeException('Unsupported file type. Upload a .xlsx or .csv file.');
    }

    /**
     * Read the header (first non-blank row) and leave the generator on the
     * first data row. Generators cannot be rewound, so callers keep
     * iterating the same generator.
     *
     * @param \Generator<int, list<string>> $rows
     * @return list<string>
     */
    public static function header(\Generator $rows): array
    {
        for (; $rows->valid(); $rows->next()) {
            $r = $rows->current();
            if (!self::isBlankRow($r)) {
                $rows->next();
                return array_map(static fn ($v) => trim((string) $v), $r);
            }
        }
        throw new RuntimeException('The file is empty.');
    }

    /** @param list<string> $r */
    public static function isBlankRow(array $r): bool
    {
        foreach ($r as $v) {
            if (trim((string) $v) !== '') {
                return false;
            }
        }
        return true;
    }

    /**
     * First header matching one of the candidates (exact, then case-insensitive).
     *
     * @param list<string> $header
     * @param list<string> $candidates
     */
    public static function pick(array $header, array $candidates): ?string
    {
        foreach ($candidates as $c) {
            if (in_array($c, $header, true)) {
                return $c;
            }
        }
        $lower = array_map('strtolower', $header);
        foreach ($candidates as $c) {
            $i = array_search(strtolower($c), $lower, true);
            if ($i !== false) {
                return $header[$i];
            }
        }
        return null;
    }

    /** @return \Generator<int, list<string>> */
    private static function csvRows(string $path): \Generator
    {
        $fh = fopen($path, 'rb');
        if ($fh === false) {
            throw new RuntimeException('Cannot read the file.');
        }
        $first = (string) fgets($fh);
        rewind($fh);
        if (str_starts_with($first, "\xEF\xBB\xBF")) {
            fread($fh, 3);
        }
        $delimiter = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
        while (($r = fgetcsv($fh, 0, $delimiter, '"', '')) !== false) {
            yield array_map('strval', $r);
        }
        fclose($fh);
    }
}
