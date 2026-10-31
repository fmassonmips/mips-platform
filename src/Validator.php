<?php
/**
 * Lightweight, deterministic server-side validators.
 * Never trust anything that didn't come from here on the server.
 */
declare(strict_types=1);

namespace App;

final class Validator
{
    /** Returns null when valid, an error message otherwise. */
    public static function email(string $email): ?string
    {
        $email = trim($email);
        if ($email === '') {
            return 'L’e-mail est obligatoire.';
        }
        if (strlen($email) > 254) {
            return 'L’e-mail est trop long.';
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 'Format d’e-mail invalide.';
        }
        return null;
    }

    /** Returns null when valid, an error message otherwise. */
    public static function password(string $password, int $minLength = 8): ?string
    {
        if ($password === '') {
            return 'Le mot de passe est obligatoire.';
        }
        if (strlen($password) < $minLength) {
            return 'Le mot de passe doit contenir au moins ' . $minLength . ' caractères.';
        }
        if (strlen($password) > 255) {
            return 'Le mot de passe est trop long.';
        }
        return null;
    }

    /** Returns null when valid, an error message otherwise. */
    public static function name(string $name): ?string
    {
        $name = trim($name);
        if ($name === '') {
            return 'Le nom est obligatoire.';
        }
        if (strlen($name) > 120) {
            return 'Le nom ne doit pas dépasser 120 caractères.';
        }
        return null;
    }
}
