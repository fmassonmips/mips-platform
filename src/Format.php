<?php
/**
 * Display formats for Mauritius: dates as dd/mm/yyyy, times 24 h.
 * Storage, form inputs, MRA payloads and CSV exports stay ISO (Y-m-d).
 */
declare(strict_types=1);

namespace App;

final class Format
{
    /** "2026-10-26" or "2026-10-26 14:05:09" → "26/10/2026"; null/invalid → $empty */
    public static function date(?string $value, string $empty = '—'): string
    {
        if ($value === null || !preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $value, $m)) {
            return $empty;
        }
        return "{$m[3]}/{$m[2]}/{$m[1]}";
    }

    /** "2026-10-26 14:05:09" → "26/10/2026 14:05"; a bare date gives the date only */
    public static function dateTime(?string $value, string $empty = '—'): string
    {
        if ($value === null || !preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/', $value, $m)) {
            return $empty;
        }
        return "{$m[3]}/{$m[2]}/{$m[1]}" . (isset($m[4]) ? " {$m[4]}:{$m[5]}" : '');
    }
}
