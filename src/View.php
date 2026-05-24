<?php
declare(strict_types=1);

namespace App;

/**
 * Minimal template renderer.
 *
 * Usage in controllers:
 *   View::render('clients/index', compact('clients', 'search'));
 *   View::flash('success', 'Client saved.');
 *
 * Templates live in app/Views/{view}.php.
 * Auth views skip the main layout by passing layout=''.
 */
final class View
{
    public static function render(string $view, array $data = [], string $layout = 'main'): void
    {
        // Make $data keys available as variables inside the template.
        extract($data, EXTR_SKIP);

        // Capture the inner view.
        ob_start();
        $viewFile = APP_PATH . '/Views/' . $view . '.php';
        if (!is_file($viewFile)) {
            ob_end_clean();
            throw new \RuntimeException("View not found: {$view}");
        }
        require $viewFile;
        $content = (string) ob_get_clean();

        if ($layout !== '') {
            $layoutFile = APP_PATH . '/Views/layout/' . $layout . '.php';
            if (!is_file($layoutFile)) {
                throw new \RuntimeException("Layout not found: {$layout}");
            }
            require $layoutFile;
        } else {
            echo $content;
        }
    }

    /** Store a one-shot flash message in the session. */
    public static function flash(string $type, string $message): void
    {
        $_SESSION['flash'] = compact('type', 'message');
    }

    /** Retrieve and clear the current flash message. */
    public static function getFlash(): ?array
    {
        $flash = $_SESSION['flash'] ?? null;
        unset($_SESSION['flash']);
        return $flash;
    }

    /** HTML-escape helper — call as e($value) inside templates. */
    public static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

// Global shortcut so templates can write e($var) instead of View::e($var).
if (!function_exists('e')) {
    function e(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
