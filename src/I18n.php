<?php
/**
 * Tiny translation layer for the bilingual (EN/FR) interface.
 *
 * Locale resolution order, highest priority first:
 *   1. ?lang=xx query parameter (persisted to session + cookie)
 *   2. session value
 *   3. cookie value
 *   4. configured default
 *
 * Messages live in src/lang/<locale>.php as a flat key => string map.
 * Missing keys fall back to the default locale, then to the key itself,
 * so a missing translation is visible but never fatal.
 */
declare(strict_types=1);

namespace App;

final class I18n
{
    private static string $locale  = 'en';
    private static string $default = 'en';
    /** @var array<string,string> $messages */
    private static array $messages = [];
    /** @var array<string,string> $available locale => label */
    private static array $available = ['en' => 'English'];
    private static string $cookie = 'mips_lang';

    /**
     * Initialise from config. Call once, after the session has started.
     *
     * @param array<string,mixed> $cfg the 'i18n' config block
     */
    public static function init(array $cfg): void
    {
        self::$default   = (string) ($cfg['default'] ?? 'en');
        self::$available = is_array($cfg['available'] ?? null) ? $cfg['available'] : ['en' => 'English'];
        self::$cookie    = (string) ($cfg['cookie'] ?? 'mips_lang');

        $locale = self::resolveLocale();
        self::$locale = $locale;
        self::$messages = self::load($locale);
    }

    private static function resolveLocale(): string
    {
        // 1. Explicit choice via query string.
        $requested = isset($_GET['lang']) && is_string($_GET['lang']) ? $_GET['lang'] : null;
        if ($requested !== null && isset(self::$available[$requested])) {
            self::persist($requested);
            return $requested;
        }

        // 2. Session, 3. Cookie.
        foreach ([$_SESSION['locale'] ?? null, $_COOKIE[self::$cookie] ?? null] as $candidate) {
            if (is_string($candidate) && isset(self::$available[$candidate])) {
                return $candidate;
            }
        }

        // 4. Default.
        return self::$default;
    }

    private static function persist(string $locale): void
    {
        $_SESSION['locale'] = $locale;
        // Year-long cookie so the choice survives across sessions.
        setcookie(self::$cookie, $locale, [
            'expires'  => time() + 31536000,
            'path'     => '/',
            'secure'   => (($_SERVER['HTTPS'] ?? '') === 'on')
                || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
            'httponly' => false, // readable by JS so the selector can reflect state
            'samesite' => 'Lax',
        ]);
    }

    /**
     * @return array<string,string>
     */
    private static function load(string $locale): array
    {
        $file = SRC_PATH . '/lang/' . $locale . '.php';
        $msgs = is_file($file) ? require $file : [];
        if (!is_array($msgs)) {
            $msgs = [];
        }

        // Merge default locale underneath so partial translations still resolve.
        if ($locale !== self::$default) {
            $defFile = SRC_PATH . '/lang/' . self::$default . '.php';
            $def     = is_file($defFile) ? require $defFile : [];
            if (is_array($def)) {
                $msgs = $msgs + $def;
            }
        }
        return $msgs;
    }

    public static function locale(): string
    {
        return self::$locale;
    }

    /**
     * @return array<string,string>
     */
    public static function available(): array
    {
        return self::$available;
    }

    /**
     * Translate a key, with optional {placeholder} replacements.
     *
     * @param array<string,string|int> $repl
     */
    public static function t(string $key, array $repl = []): string
    {
        $msg = self::$messages[$key] ?? $key;
        foreach ($repl as $k => $v) {
            $msg = str_replace('{' . $k . '}', (string) $v, $msg);
        }
        return $msg;
    }

    /**
     * The full message map for the active locale — handed to the JS layer so
     * client-rendered tables and modals can be translated too.
     *
     * @return array<string,string>
     */
    public static function messages(): array
    {
        return self::$messages;
    }

    /**
     * Build a URL for the current page that switches to the given locale,
     * preserving the existing path and query string.
     */
    public static function switchUrl(string $locale): string
    {
        $uri   = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        $parts = explode('?', $uri, 2);
        $path  = $parts[0];

        $query = [];
        if (isset($parts[1]) && $parts[1] !== '') {
            parse_str($parts[1], $query);
        }
        $query['lang'] = $locale;

        return $path . '?' . http_build_query($query);
    }
}
