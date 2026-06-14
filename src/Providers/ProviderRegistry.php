<?php
/**
 * Builds and caches provider adapters from configuration.
 *
 * Only enabled providers are instantiated. This is the single place that knows
 * how to construct each adapter, keeping the routing engine declarative.
 */
declare(strict_types=1);

namespace App\Providers;

use RuntimeException;

final class ProviderRegistry
{
    /** @var array<string, PaymentProvider> */
    private array $instances = [];

    /** @var array<string, class-string<PaymentProvider>> */
    private const ADAPTERS = [
        'passpass' => PassPassProvider::class,
        'paypump'  => PaypumpProvider::class,
        'inflow'   => InflowProvider::class,
        'cardrail' => CardRailStubProvider::class,
    ];

    /**
     * @param array<string, array<string,mixed>> $providerConfigs config['providers']
     */
    public function __construct(private readonly array $providerConfigs)
    {
    }

    public static function fromGlobalConfig(): self
    {
        /** @var array<string, array<string,mixed>> $cfg */
        $cfg = $GLOBALS['config']['providers'] ?? [];
        return new self($cfg);
    }

    public function has(string $key): bool
    {
        return isset(self::ADAPTERS[$key]) && (bool) ($this->providerConfigs[$key]['enabled'] ?? false);
    }

    public function get(string $key): PaymentProvider
    {
        if (isset($this->instances[$key])) {
            return $this->instances[$key];
        }
        if (!isset(self::ADAPTERS[$key])) {
            throw new RuntimeException("Unknown provider: {$key}");
        }
        if (!$this->has($key)) {
            throw new RuntimeException("Provider not enabled: {$key}");
        }

        $class  = self::ADAPTERS[$key];
        $config = $this->providerConfigs[$key] ?? [];

        return $this->instances[$key] = new $class($config);
    }

    /** @return list<string> Keys of enabled providers. */
    public function enabledKeys(): array
    {
        return array_values(array_filter(
            array_keys(self::ADAPTERS),
            fn (string $k): bool => $this->has($k),
        ));
    }
}
