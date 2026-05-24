<?php
declare(strict_types=1);

namespace App;

/**
 * Fluent server-side validator used by MVC controllers.
 *
 * Usage:
 *   $v = new Validator($_POST);
 *   $v->required('email')->email('email')->maxLen('name', 80);
 *   if ($v->fails()) { $errors = $v->errors(); }
 */
final class Validator
{
    private array $data;
    private array $errors = [];

    public function __construct(array $data)
    {
        $this->data = $data;
    }

    public function required(string $field): self
    {
        $val = trim((string) ($this->data[$field] ?? ''));
        if ($val === '') {
            $this->errors[$field] ??= $this->label($field) . ' is required.';
        }
        return $this;
    }

    public function maxLen(string $field, int $max): self
    {
        $val = (string) ($this->data[$field] ?? '');
        if ($val !== '' && mb_strlen($val) > $max) {
            $this->errors[$field] ??= $this->label($field) . " must be at most {$max} characters.";
        }
        return $this;
    }

    public function email(string $field): self
    {
        $val = trim((string) ($this->data[$field] ?? ''));
        if ($val !== '' && !filter_var($val, FILTER_VALIDATE_EMAIL)) {
            $this->errors[$field] ??= 'Invalid email address.';
        }
        return $this;
    }

    public function numeric(string $field): self
    {
        $val = trim((string) ($this->data[$field] ?? ''));
        if ($val !== '' && !is_numeric(str_replace(',', '', $val))) {
            $this->errors[$field] ??= $this->label($field) . ' must be a number.';
        }
        return $this;
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    /** @return array<string,string> */
    public function errors(): array
    {
        return $this->errors;
    }

    private function label(string $field): string
    {
        return ucwords(str_replace('_', ' ', $field));
    }
}
