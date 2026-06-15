<?php
/**
 * Configurable payment routing engine.
 *
 * Resolves a PaymentType to a concrete provider adapter using rules from
 * config['routing'] (overridable per-environment and, in production, from the
 * payment_routes table managed in the Admin portal).
 *
 * Resolution order:
 *   1. Explicit rule for the payment type   (routing.rules[TYPE])
 *   2. First provider in routing.priority that supports the type and is enabled
 *   3. routing.default
 *
 * The selected provider must be enabled AND actually support the type, otherwise
 * routing fails loudly rather than silently mis-sending a payment.
 */
declare(strict_types=1);

namespace App\Routing;

use App\Domain\PaymentType;
use App\Providers\PaymentProvider;
use App\Providers\ProviderRegistry;
use RuntimeException;

final class PaymentRouter
{
    /**
     * @param array<string,mixed> $routingConfig config['routing']
     */
    public function __construct(
        private readonly ProviderRegistry $registry,
        private readonly array $routingConfig,
    ) {
    }

    public static function fromGlobalConfig(): self
    {
        /** @var array<string,mixed> $routing */
        $routing = $GLOBALS['config']['routing'] ?? [];
        return new self(ProviderRegistry::fromGlobalConfig(), $routing);
    }

    /**
     * Decide which provider key should handle this payment type, without
     * instantiating it. Useful for previews and admin tooling.
     */
    public function resolveKey(PaymentType $type): string
    {
        /** @var array<string,string> $rules */
        $rules = $this->routingConfig['rules'] ?? [];
        if (isset($rules[$type->value]) && $this->registry->has($rules[$type->value])) {
            $candidate = $rules[$type->value];
            if ($this->registry->get($candidate)->supports($type)) {
                return $candidate;
            }
        }

        /** @var list<string> $priority */
        $priority = $this->routingConfig['priority'] ?? [];
        foreach ($priority as $key) {
            if ($this->registry->has($key) && $this->registry->get($key)->supports($type)) {
                return $key;
            }
        }

        $default = (string) ($this->routingConfig['default'] ?? '');
        if ($default !== '' && $this->registry->has($default) && $this->registry->get($default)->supports($type)) {
            return $default;
        }

        throw new RuntimeException('No enabled provider can route payment type: ' . $type->value);
    }

    public function route(PaymentType $type): PaymentProvider
    {
        return $this->registry->get($this->resolveKey($type));
    }

    /**
     * Full routing table for the Admin portal: type -> resolved provider (or error).
     *
     * @return array<string, string>
     */
    public function table(): array
    {
        $out = [];
        foreach (PaymentType::cases() as $type) {
            try {
                $out[$type->value] = $this->resolveKey($type);
            } catch (RuntimeException $e) {
                $out[$type->value] = 'UNROUTABLE';
            }
        }
        return $out;
    }
}
