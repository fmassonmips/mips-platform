<?php
/**
 * Photos sent as data URLs (shrunk to JPEG in the browser): checked for
 * type, size and that the bytes really are an image.
 */
declare(strict_types=1);

namespace App\Suite;

final class Images
{
    /** Largest accepted image, base64 data URL. */
    public const MAX_BYTES = 400_000;

    /** Null when the data URL is an acceptable image, an error message otherwise. */
    public static function check(string $dataUrl): ?string
    {
        if (strlen($dataUrl) > self::MAX_BYTES || !preg_match('#^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $m)) {
            return 'Image invalide ou trop lourde.';
        }
        $bin = base64_decode($m[2], true);
        if ($bin === false || @getimagesizefromstring($bin) === false) {
            return 'Image illisible.';
        }
        return null;
    }
}
