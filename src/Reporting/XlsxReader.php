<?php
/**
 * Minimal streaming reader for the first worksheet of an .xlsx file.
 *
 * Avoids a Composer dependency: unzips the workbook with ZipArchive and
 * streams the sheet XML with XMLReader, so memory stays flat on large
 * Commission_Data exports. Only cell values are read (no styles); dates
 * come back as Excel serial numbers and are converted by the importer.
 */
declare(strict_types=1);

namespace App\Reporting;

use RuntimeException;
use XMLReader;
use ZipArchive;

final class XlsxReader
{
    /**
     * Yield each row as a 0-indexed list of string values.
     *
     * @return \Generator<int, list<string>>
     */
    public static function rows(string $path): \Generator
    {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            throw new RuntimeException('Not a valid .xlsx file.');
        }

        $sheetPath = self::firstSheetPath($zip);
        $shared    = self::sharedStrings($zip);
        $zip->close();

        $reader = new XMLReader();
        if (!$reader->open('zip://' . $path . '#' . $sheetPath)) {
            throw new RuntimeException('Cannot read worksheet.');
        }

        $row  = [];
        $col  = 0;
        $type = '';
        $inRow = false;
        while ($reader->read()) {
            if ($reader->nodeType === XMLReader::ELEMENT) {
                switch ($reader->localName) {
                    case 'row':
                        $row   = [];
                        $col   = 0;
                        $inRow = true;
                        if ($reader->isEmptyElement) {
                            $inRow = false;
                            yield [];
                        }
                        break;
                    case 'c':
                        $ref  = (string) $reader->getAttribute('r');
                        $col  = $ref !== '' ? self::columnIndex($ref) : count($row);
                        $type = (string) $reader->getAttribute('t');
                        break;
                    case 'v':
                        $value = $reader->readString();
                        $row[$col] = $type === 's' ? ($shared[(int) $value] ?? '') : $value;
                        break;
                    case 'is':
                        // Inline string: concatenate all <t> descendants.
                        $row[$col] = self::innerText($reader->readOuterXml());
                        break;
                }
            } elseif ($reader->nodeType === XMLReader::END_ELEMENT && $reader->localName === 'row' && $inRow) {
                $inRow = false;
                yield self::densify($row);
            }
        }
        $reader->close();
    }

    private static function firstSheetPath(ZipArchive $zip): string
    {
        $workbook = $zip->getFromName('xl/workbook.xml');
        $rels     = $zip->getFromName('xl/_rels/workbook.xml.rels');
        if ($workbook === false || $rels === false) {
            throw new RuntimeException('Not a valid .xlsx file.');
        }

        $wb = simplexml_load_string($workbook);
        $rx = simplexml_load_string($rels);
        if ($wb === false || $rx === false || !isset($wb->sheets->sheet[0])) {
            throw new RuntimeException('Workbook has no worksheet.');
        }

        $rid = (string) $wb->sheets->sheet[0]->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
        foreach ($rx->Relationship as $rel) {
            if ((string) $rel['Id'] === $rid) {
                $target = ltrim((string) $rel['Target'], '/');
                return str_starts_with($target, 'xl/') ? $target : 'xl/' . $target;
            }
        }
        return 'xl/worksheets/sheet1.xml';
    }

    /** @return list<string> */
    private static function sharedStrings(ZipArchive $zip): array
    {
        $xml = $zip->getFromName('xl/sharedStrings.xml');
        if ($xml === false) {
            return [];
        }

        $out    = [];
        $reader = new XMLReader();
        $reader->XML($xml);
        while ($reader->read()) {
            if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'si') {
                $out[] = self::innerText($reader->readOuterXml());
            }
        }
        $reader->close();
        return $out;
    }

    /** Concatenate <t> text, skipping phonetic runs (<rPh>). */
    private static function innerText(string $xml): string
    {
        $text   = '';
        $reader = new XMLReader();
        $reader->XML($xml);
        $skip = 0;
        while ($reader->read()) {
            if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'rPh' && !$reader->isEmptyElement) {
                $skip++;
            } elseif ($reader->nodeType === XMLReader::END_ELEMENT && $reader->localName === 'rPh') {
                $skip--;
            } elseif ($skip === 0 && $reader->nodeType === XMLReader::ELEMENT && $reader->localName === 't') {
                $text .= $reader->readString();
            }
        }
        $reader->close();
        return $text;
    }

    private static function columnIndex(string $ref): int
    {
        $letters = preg_replace('/\d+/', '', strtoupper($ref)) ?? '';
        $index   = 0;
        for ($i = 0, $n = strlen($letters); $i < $n; $i++) {
            $index = $index * 26 + (ord($letters[$i]) - 64);
        }
        return $index - 1;
    }

    /**
     * @param array<int,string> $row
     * @return list<string>
     */
    private static function densify(array $row): array
    {
        if ($row === []) {
            return [];
        }
        $out = array_fill(0, max(array_keys($row)) + 1, '');
        foreach ($row as $i => $v) {
            $out[$i] = $v;
        }
        return $out;
    }
}
