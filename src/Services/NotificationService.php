<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use RuntimeException;

/**
 * Dispatches email and WhatsApp notifications using stored templates.
 *
 * All outbound messages are queued in the `communications` table first,
 * then delivered via the configured transport. This ensures an audit trail
 * exists even if the delivery transport is temporarily unavailable.
 *
 * Email transport: SMTP via PHPMailer (or Sendgrid HTTP API when configured).
 * WhatsApp transport: Meta Cloud API (WhatsApp Business API).
 */
class NotificationService
{
    public function __construct(private readonly Database $db) {}

    /**
     * Render a template and dispatch via all appropriate channels for a client.
     *
     * @param string $templateKey  e.g. 'renewal_j45'
     * @param array  $context      Template variables
     * @param int    $clientId
     * @param int|null $renewalId
     * @param int|null $appointmentId
     */
    public function send(
        string $templateKey,
        array  $context,
        int    $clientId,
        ?int   $renewalId = null,
        ?int   $appointmentId = null
    ): void {
        $language = $context['language'] ?? 'en';

        foreach (['email', 'whatsapp'] as $channel) {
            $template = $this->db->fetchOne(
                'SELECT * FROM notification_templates
                  WHERE template_key = ? AND channel = ? AND language = ? AND is_active = 1',
                [$templateKey, $channel, $language]
            );

            // Fall back to English template if no localised version exists
            if (!$template && $language !== 'en') {
                $template = $this->db->fetchOne(
                    'SELECT * FROM notification_templates
                      WHERE template_key = ? AND channel = ? AND language = ? AND is_active = 1',
                    [$templateKey, $channel, 'en']
                );
            }

            if (!$template) {
                continue;
            }

            $subject = $template['subject']
                ? $this->render($template['subject'], $context)
                : null;
            $body    = $this->render($template['body_template'], $context);

            // Queue message — record persists regardless of delivery outcome
            $commId = $this->queueMessage(
                clientId:      $clientId,
                renewalId:     $renewalId,
                appointmentId: $appointmentId,
                channel:       $channel,
                templateKey:   $templateKey,
                subject:       $subject,
                body:          $body
            );

            try {
                match ($channel) {
                    'email'    => $this->sendEmail($context['client_email'] ?? '', $subject ?? '', $body, $commId),
                    'whatsapp' => $this->sendWhatsApp($context['client_wa'] ?? '', $body, $commId),
                    default    => null,
                };
            } catch (RuntimeException $e) {
                $this->markFailed($commId, $e->getMessage());
            }
        }
    }

    private function sendEmail(string $to, string $subject, string $body, int $commId): void
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->markFailed($commId, 'Invalid email address: ' . $to);
            return;
        }

        // PHPMailer integration point — wired up in bootstrap or DI container
        $mailer = $this->resolveMailer();
        $mailer->clearAddresses();
        $mailer->addAddress($to);
        $mailer->Subject = $subject;
        $mailer->Body    = nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8'));
        $mailer->AltBody = $body;
        $mailer->isHTML(true);

        if (!$mailer->send()) {
            throw new RuntimeException('PHPMailer: ' . $mailer->ErrorInfo);
        }

        $this->markSent($commId);
    }

    private function sendWhatsApp(string $to, string $body, int $commId): void
    {
        if (!$to) {
            $this->markFailed($commId, 'No WhatsApp number configured for client.');
            return;
        }

        $token    = $_ENV['WA_ACCESS_TOKEN'] ?? '';
        $phoneId  = $_ENV['WA_PHONE_NUMBER_ID'] ?? '';

        if (!$token || !$phoneId) {
            $this->markFailed($commId, 'WhatsApp credentials not configured.');
            return;
        }

        $payload = [
            'messaging_product' => 'whatsapp',
            'to'                => preg_replace('/[^+\d]/', '', $to),
            'type'              => 'text',
            'text'              => ['body' => $body],
        ];

        $ch = curl_init("https://graph.facebook.com/v19.0/{$phoneId}/messages");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $token,
            ],
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $body_resp = curl_exec($ch);
        $code      = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $data = json_decode($body_resp ?: '{}', true);

        if ($code >= 400) {
            throw new RuntimeException(
                'WhatsApp API error HTTP ' . $code . ': ' . ($data['error']['message'] ?? $body_resp)
            );
        }

        $this->markSent($commId);
    }

    /** Replace {{variable}} placeholders in a template string. */
    private function render(string $template, array $context): string
    {
        foreach ($context as $key => $value) {
            $template = str_replace('{{' . $key . '}}', (string) $value, $template);
        }
        return $template;
    }

    private function queueMessage(
        int    $clientId,
        ?int   $renewalId,
        ?int   $appointmentId,
        string $channel,
        string $templateKey,
        ?string $subject,
        string $body
    ): int {
        $this->db->execute(
            "INSERT INTO communications
                (client_id, renewal_id, appointment_id, channel, direction,
                 template_key, subject, body, status, created_at)
             VALUES (?, ?, ?, ?, 'outbound', ?, ?, ?, 'queued', NOW())",
            [$clientId, $renewalId, $appointmentId, $channel, $templateKey, $subject, $body]
        );
        return (int) $this->db->lastInsertId();
    }

    private function markSent(int $commId): void
    {
        $this->db->execute(
            "UPDATE communications SET status = 'sent', sent_at = NOW() WHERE id = ?",
            [$commId]
        );
    }

    private function markFailed(int $commId, string $error): void
    {
        $this->db->execute(
            "UPDATE communications SET status = 'failed', error_detail = ? WHERE id = ?",
            [mb_substr($error, 0, 2000), $commId]
        );
    }

    private function resolveMailer(): \PHPMailer\PHPMailer\PHPMailer
    {
        // Expects PHPMailer to be available via Composer autoload.
        // Configuration via environment variables.
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = $_ENV['SMTP_HOST'] ?? 'localhost';
        $mail->SMTPAuth   = true;
        $mail->Username   = $_ENV['SMTP_USER'] ?? '';
        $mail->Password   = $_ENV['SMTP_PASS'] ?? '';
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = (int) ($_ENV['SMTP_PORT'] ?? 587);
        $mail->setFrom($_ENV['MAIL_FROM'] ?? 'noreply@insurlink.mu', $_ENV['MAIL_FROM_NAME'] ?? 'InsurLink MU');
        $mail->CharSet    = 'UTF-8';
        return $mail;
    }
}
