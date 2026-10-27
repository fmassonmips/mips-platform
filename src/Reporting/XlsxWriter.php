<?php
/**
 * Minimal .xlsx writer (Office Open XML), no Composer dependency.
 *
 * $x = new XlsxWriter();
 * $x->addSheet('Summary', [
 *     'columns' => [['MUR volume', 'money', 16], ...],   // [header, format, width]
 *     'rows'    => [[...], ...],                          // numbers stay numbers; null = empty cell
 *     'bold_rows' => [3, 7],                              // 0-based row indexes to emphasise
 *     'title'   => 'MIPS monthly report — 2026-10',       // optional line above the header
 * ]);
 * $x->download('report.xlsx');
 *
 * Formats: text, int (#,##0), money (#,##0.00), pct (0.0%), date (yyyy-mm-dd text).
 * Header row is bold, frozen and filterable. Strings are written as inline
 * strings, so a value like "=cmd" is text, never a formula.
 */
declare(strict_types=1);

namespace App\Reporting;

use RuntimeException;
use ZipArchive;

final class XlsxWriter
{
    // cellXfs indexes in styles.xml.
    private const STYLE = [
        'text' => 0, 'header' => 1, 'int' => 2, 'money' => 3, 'pct' => 4,
        'int_b' => 5, 'money_b' => 6, 'pct_b' => 7, 'text_b' => 8, 'title' => 9,
    ];

    /** @var list<array{name:string, xml:string}> */
    private array $sheets = [];

    /** @param array<string,mixed> $spec */
    public function addSheet(string $name, array $spec): void
    {
        $name = $this->sheetName($name);
        $cols = $spec['columns'];
        $bold = array_flip($spec['bold_rows'] ?? []);
        $r    = 1;
        $rowsXml = '';

        if (!empty($spec['title'])) {
            $rowsXml .= '<row r="1">' . $this->cell('A1', (string) $spec['title'], 'title') . '</row>';
            $r = 3;
        }
        $headerRow = $r;

        $cells = '';
        foreach ($cols as $i => [$label]) {
            $cells .= $this->cell(self::col($i) . $r, (string) $label, 'header');
        }
        $rowsXml .= '<row r="' . $r . '">' . $cells . '</row>';

        foreach ($spec['rows'] as $k => $row) {
            $r++;
            $cells = '';
            foreach ($cols as $i => [, $fmt]) {
                $v = $row[$i] ?? null;
                if ($v === null || $v === '') {
                    continue;
                }
                $style = isset($bold[$k]) ? ($fmt === 'text' ? 'text_b' : $fmt . '_b') : $fmt;
                $cells .= $this->cell(self::col($i) . $r, $v, $style);
            }
            $rowsXml .= '<row r="' . $r . '">' . $cells . '</row>';
        }

        $last  = self::col(count($cols) - 1);
        $width = '';
        foreach ($cols as $i => $c) {
            $width .= '<col min="' . ($i + 1) . '" max="' . ($i + 1) . '" width="' . ($c[2] ?? 14) . '" customWidth="1"/>';
        }

        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' . $headerRow . '" topLeftCell="A' . ($headerRow + 1)
            . '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            . '<sheetFormatPr defaultRowHeight="15"/>'
            . '<cols>' . $width . '</cols>'
            . '<sheetData>' . $rowsXml . '</sheetData>'
            . ($r > $headerRow ? '<autoFilter ref="A' . $headerRow . ':' . $last . $r . '"/>' : '')
            . '</worksheet>';

        $this->sheets[] = ['name' => $name, 'xml' => $xml];
    }

    /** Write the workbook to a file. */
    public function save(string $path): void
    {
        if ($this->sheets === []) {
            throw new RuntimeException('Workbook has no sheet.');
        }
        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Cannot create the workbook.');
        }

        $n = count($this->sheets);
        $overrides = '';
        $wbSheets  = '';
        $wbRels    = '';
        foreach ($this->sheets as $i => $s) {
            $id = $i + 1;
            $zip->addFromString("xl/worksheets/sheet$id.xml", $s['xml']);
            $overrides .= '<Override PartName="/xl/worksheets/sheet' . $id . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            $wbSheets  .= '<sheet name="' . self::esc($s['name']) . '" sheetId="' . $id . '" r:id="rId' . $id . '"/>';
            $wbRels    .= '<Relationship Id="rId' . $id . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $id . '.xml"/>';
        }
        // Filter ranges must be declared as defined names for Excel to keep them.
        $names = '';
        foreach ($this->sheets as $i => $s) {
            if (preg_match('/<autoFilter ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/', $s['xml'], $m)) {
                $names .= '<definedName name="_xlnm._FilterDatabase" localSheetId="' . $i . '" hidden="1">\''
                    . self::esc(str_replace("'", "''", $s['name'])) . "'!\$$m[1]\$$m[2]:\$$m[3]\$$m[4]</definedName>";
            }
        }

        $zip->addFromString('[Content_Types].xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            . $overrides . '</Types>');
        $zip->addFromString('_rels/.rels',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
            . '</Relationships>');
        $zip->addFromString('docProps/core.xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            . '<dc:creator>MIPS Dashboard</dc:creator>'
            . '<dcterms:created xsi:type="dcterms:W3CDTF">' . gmdate('Y-m-d\TH:i:s\Z') . '</dcterms:created>'
            . '</cp:coreProperties>');
        $zip->addFromString('xl/workbook.xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<bookViews><workbookView activeTab="0"/></bookViews>'
            . '<sheets>' . $wbSheets . '</sheets>'
            . ($names !== '' ? '<definedNames>' . $names . '</definedNames>' : '')
            . '</workbook>');
        $zip->addFromString('xl/_rels/workbook.xml.rels',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $wbRels
            . '<Relationship Id="rId' . ($n + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>');
        $zip->addFromString('xl/styles.xml', self::styles());
        $zip->close();
    }

    /** Stream the workbook as a download and stop. */
    public function download(string $filename): never
    {
        $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
        if ($tmp === false) {
            throw new RuntimeException('Cannot create a temporary file.');
        }
        try {
            $this->save($tmp);
            header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $filename) . '"');
            header('Content-Length: ' . filesize($tmp));
            header('Cache-Control: no-store');
            readfile($tmp);
        } finally {
            @unlink($tmp);
        }
        exit;
    }

    private function cell(string $ref, mixed $v, string $style): string
    {
        $s = self::STYLE[$style] ?? 0;
        if (is_int($v) || is_float($v)) {
            if (!is_finite((float) $v)) {
                return '';
            }
            // Plain decimal notation: no exponent, no locale separators.
            $num = is_int($v) ? (string) $v : rtrim(rtrim(sprintf('%.10F', $v), '0'), '.');
            return '<c r="' . $ref . '" s="' . $s . '"><v>' . $num . '</v></c>';
        }
        return '<c r="' . $ref . '" s="' . $s . '" t="inlineStr"><is><t xml:space="preserve">' . self::esc((string) $v) . '</t></is></c>';
    }

    /** Excel sheet names: max 31 chars, none of []:*?/\ and unique. */
    private function sheetName(string $name): string
    {
        $base = mb_substr(preg_replace('#[\[\]:*?/\\\\]#', '-', $name) ?? 'Sheet', 0, 31);
        $taken = array_map(static fn ($s) => mb_strtolower($s['name']), $this->sheets);
        $out = $base;
        for ($i = 2; in_array(mb_strtolower($out), $taken, true); $i++) {
            $out = mb_substr($base, 0, 28) . ' ' . $i;
        }
        return $out;
    }

    private static function col(int $i): string
    {
        $s = '';
        for ($i++; $i > 0; $i = intdiv($i - 1, 26)) {
            $s = chr(65 + ($i - 1) % 26) . $s;
        }
        return $s;
    }

    private static function esc(string $v): string
    {
        // Drop control characters that are invalid in XML 1.0.
        $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $v) ?? '';
        return htmlspecialchars($v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private static function styles(): string
    {
        // Built-in number formats: 3 = #,##0 ; 4 = #,##0.00. Custom 164 = 0.0%.
        $xf = static fn (int $fmt, int $font, int $fill = 0, string $align = '') =>
            '<xf numFmtId="' . $fmt . '" fontId="' . $font . '" fillId="' . $fill . '" borderId="0" xfId="0"'
            . ($fmt ? ' applyNumberFormat="1"' : '') . ($font ? ' applyFont="1"' : '') . ($fill ? ' applyFill="1"' : '')
            . ($align ? ' applyAlignment="1"><alignment ' . $align . '/></xf>' : '/>');

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>'
            . '<fonts count="3">'
            . '<font><sz val="11"/><name val="Arial"/></font>'
            . '<font><b/><sz val="11"/><name val="Arial"/></font>'
            . '<font><b/><sz val="14"/><name val="Arial"/></font>'
            . '</fonts>'
            . '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F7"/><bgColor indexed="64"/></patternFill></fill></fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="10">'
            . $xf(0, 0)                                   // 0 text
            . $xf(0, 1, 2, 'wrapText="1" vertical="center"')  // 1 header
            . $xf(3, 0)                                   // 2 int
            . $xf(4, 0)                                   // 3 money
            . $xf(164, 0)                                 // 4 pct
            . $xf(3, 1)                                   // 5 int bold
            . $xf(4, 1)                                   // 6 money bold
            . $xf(164, 1)                                 // 7 pct bold
            . $xf(0, 1)                                   // 8 text bold
            . $xf(0, 2)                                   // 9 title
            . '</cellXfs>'
            . '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            . '</styleSheet>';
    }
}
