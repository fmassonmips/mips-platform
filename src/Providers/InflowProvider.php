<?php
/**
 * Inflow — orchestration / workflow engine.
 *
 * Drives multi-step processes (e.g. onboarding pipelines, approval chains,
 * conditional payout flows). It is not a payment rail itself; it coordinates
 * other providers. Sandbox simulation in MVP.
 */
declare(strict_types=1);

namespace App\Providers;

use App\Domain\PaymentType;
use App\Domain\TransactionStatus;
use App\Support\Reference;

final class InflowProvider extends AbstractProvider implements PaymentProvider
{
    public function name(): string
    {
        return 'inflow';
    }

    public function supports(PaymentType $type): bool
    {
        return $type === PaymentType::Workflow;
    }

    public function createPayment(PaymentRequest $request): ProviderResult
    {
        // A "payment" routed to Inflow is really a workflow trigger.
        return $this->createWorkflow([
            'amount_minor' => $request->amountMinor,
            'currency'     => $request->currency,
            'metadata'     => $request->metadata,
        ]);
    }

    /**
     * @param array<string,mixed> $definition
     */
    public function createWorkflow(array $definition): ProviderResult
    {
        $workflowId = Reference::generate('WFL');
        return ProviderResult::ok($this->name(), $workflowId, TransactionStatus::Pending, [
            'workflow_id' => $workflowId,
            'steps'       => $definition['steps'] ?? [],
            'simulated'   => !$this->isLive(),
        ]);
    }

    public function triggerWorkflow(string $workflowId): ProviderResult
    {
        return ProviderResult::ok($this->name(), $workflowId, TransactionStatus::Processing, [
            'simulated' => !$this->isLive(),
        ]);
    }

    public function getWorkflowStatus(string $workflowId): ProviderResult
    {
        return ProviderResult::ok($this->name(), $workflowId, TransactionStatus::Paid, [
            'simulated' => !$this->isLive(),
        ]);
    }

    public function getPaymentStatus(string $providerReference): ProviderResult
    {
        return $this->getWorkflowStatus($providerReference);
    }

    public function refundPayment(string $providerReference, ?int $amountMinor = null): ProviderResult
    {
        return ProviderResult::fail($this->name(), 'unsupported', 'Inflow workflows are not refundable directly');
    }

    public function cancelPayment(string $providerReference): ProviderResult
    {
        return ProviderResult::ok($this->name(), $providerReference, TransactionStatus::Cancelled, [
            'simulated' => !$this->isLive(),
        ]);
    }

    public function handleWebhook(string $rawBody, array $headers): array
    {
        $verified = $this->verifySignature($rawBody, $headers, 'X-Inflow-Signature');
        $payload  = json_decode($rawBody, true);

        return [
            'verified' => $verified,
            'provider' => $this->name(),
            'event'    => is_array($payload) ? ($payload['event'] ?? null) : null,
            'data'     => is_array($payload) ? ($payload['data'] ?? []) : [],
        ];
    }
}
