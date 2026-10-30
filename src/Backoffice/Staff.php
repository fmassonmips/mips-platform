<?php
/**
 * MIPS team access to the back-office: logged in with their own account, and
 * their address listed in config backoffice.staff. Everyone else sees a 404,
 * so the back-office does not show up for customers.
 */
declare(strict_types=1);

namespace App\Backoffice;

use App\Auth;
use App\Response;

final class Staff
{
    /**
     * @param array<string,mixed>|null $user
     */
    public static function is(?array $user): bool
    {
        if ($user === null) {
            return false;
        }
        $staff = array_map(static fn ($e): string => mb_strtolower(trim((string) $e)), (array) ($GLOBALS['config']['backoffice']['staff'] ?? []));
        return in_array(mb_strtolower((string) $user['email']), $staff, true);
    }

    /**
     * The staff user of a back-office page, or a 404 for anyone else.
     *
     * @return array<string,mixed>
     */
    public static function requirePage(): array
    {
        $user = Auth::current_user();
        if ($user === null) {
            header('Location: /login.php');
            exit;
        }
        if (!self::is($user)) {
            http_response_code(404);
            echo 'Page introuvable.';
            exit;
        }
        return $user;
    }

    /**
     * The staff user of a back-office API call, or a JSON 404.
     *
     * @return array<string,mixed>
     */
    public static function requireApi(): array
    {
        $user = Auth::current_user();
        if (!self::is($user)) {
            Response::json(['error' => 'Introuvable.'], 404);
        }
        return $user;
    }
}
