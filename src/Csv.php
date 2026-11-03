<?php
/**
 * CSV download helper. Neutralises spreadsheet formula injection: text
 * cells starting with = + - @ are prefixed with a quote.
 */
declare(strict_types=1);

namespace App;

final class Csv
{
    /**
     * @param list<string>             $header
     * @param iterable<list<mixed>>    $rows
     */
    public static function download(string $filename, array $header, iterable $rows): never
    {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $filename) . '"');
        header('Cache-Control: no-store');

        $out = fopen('php://output', 'wb');
        fwrite($out, "\xEF\xBB\xBF"); // BOM so Excel reads UTF-8
        fputcsv($out, $header, ',', '"', '');
        foreach ($rows as $row) {
            fputcsv($out, array_map([self::class, 'cell'], $row), ',', '"', '');
        }
        fclose($out);
        exit;
    }

    private static function cell(mixed $v): string
    {
        if ($v === null) {
            return '';
        }
        if (is_int($v) || is_float($v)) {
            return (string) $v;
        }
        $s = (string) $v;
        if ($s !== '' && !is_numeric($s) && in_array($s[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
            return "'" . $s;
        }
        return $s;
    }
}
