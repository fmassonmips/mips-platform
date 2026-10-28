<?php
/**
 * Suite module catalog.
 *
 * Single source of truth for the apps sold under my.mips.mu. Kept in code
 * (not in the DB) so it is versioned with the features that implement it.
 * Activations per tenant live in the organization_modules table.
 *
 * Fields:
 *  - name    : brand name shown to users
 *  - domain  : marketing domain (landing page that links back to my.mips.mu)
 *  - tagline : one-line function
 *  - status  : 'available' (usable) | 'coming_soon' (listed, not activatable)
 */
declare(strict_types=1);

namespace App\Suite;

final class Catalog
{
    /** @var array<string,array{name:string,domain:string,tagline:string,status:string}> */
    private const MODULES = [
        'bizpilot'    => ['name' => 'BizPilot',    'domain' => 'bizpilot.mu',     'tagline' => 'Tableau de bord',         'status' => 'available'],
        'bookora'     => ['name' => 'Bookora',     'domain' => 'bookora.com',     'tagline' => 'Réservations en ligne',   'status' => 'coming_soon'],
        'facturo'     => ['name' => 'Facturo',     'domain' => 'facturo.mu',      'tagline' => 'Devis & factures',        'status' => 'available'],
        'teamnest'    => ['name' => 'TeamNest',    'domain' => 'teamnest.com',    'tagline' => 'Équipes & projets',       'status' => 'available'],
        'shoplokal'   => ['name' => 'ShopLokal',   'domain' => 'shoplokal.mu',    'tagline' => 'Boutiques en ligne',      'status' => 'coming_soon'],
        'clientbloom' => ['name' => 'ClientBloom', 'domain' => 'clientbloom.com', 'tagline' => 'CRM & fidélité',          'status' => 'available'],
        'staffzen'    => ['name' => 'StaffZen',    'domain' => 'staffzen.mu',     'tagline' => 'RH & congés',             'status' => 'coming_soon'],
        'formelio'    => ['name' => 'Formelio',    'domain' => 'formelio.com',    'tagline' => 'Formulaires & sondages',  'status' => 'available'],
        'rendezvous'  => ['name' => 'RendezVous',  'domain' => 'rendezvous.mu',   'tagline' => 'Prise de rendez-vous',    'status' => 'available'],
        'flowdesk'    => ['name' => 'FlowDesk',    'domain' => 'flowdesk.com',    'tagline' => 'Support client',          'status' => 'available'],
    ];

    /** Free trial length granted on activation. */
    public const TRIAL_DAYS = 30;

    /**
     * @return array<string,array{name:string,domain:string,tagline:string,status:string}>
     */
    public static function all(): array
    {
        return self::MODULES;
    }

    /**
     * @return array{name:string,domain:string,tagline:string,status:string}|null
     */
    public static function get(string $slug): ?array
    {
        return self::MODULES[$slug] ?? null;
    }

    public static function isAvailable(string $slug): bool
    {
        return (self::MODULES[$slug]['status'] ?? null) === 'available';
    }
}
