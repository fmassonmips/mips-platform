<?php
/**
 * Guard for Facturo JSON endpoints (see Suite\ModuleApi).
 */
declare(strict_types=1);

namespace App\Facturo;

use App\Suite\ModuleApi;

final class Api
{
    /**
     * @return array{0:array<string,mixed>,1:array{id:int,name:string,role:string}} [user, org]
     */
    public static function context(): array
    {
        return ModuleApi::context('facturo');
    }
}
