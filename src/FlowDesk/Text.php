<?php
/**
 * What customers see (support form, ticket page, e-mails), in the company's
 * document language. The back office stays in French.
 */
declare(strict_types=1);

namespace App\FlowDesk;

final class Text
{
    private const TEXT = [
        'fr' => [
            'title' => 'Contacter le support', 'name' => 'Nom', 'email' => 'E-mail (pour recevoir nos réponses)',
            'phone' => 'Téléphone (facultatif)', 'subject' => 'Sujet', 'message' => 'Votre message', 'send' => 'Envoyer',
            'closed_form' => 'Le formulaire de contact est fermé pour le moment.', 'not_found' => 'Page introuvable.',
            'ticket' => 'Demande n° %d', 'you' => 'Vous', 'support' => 'Support', 'reply' => 'Répondre',
            'your_reply' => 'Votre réponse', 'status' => 'Statut', 'keep_link' => 'Gardez ce lien pour suivre votre demande et répondre.',
            'created' => 'Votre demande est enregistrée. Nous vous répondons au plus vite.',
            'ticket_closed' => 'Cette demande est clôturée. Pour une nouvelle question, contactez-nous à nouveau.',
            'st_open' => 'En cours', 'st_pending' => 'Réponse attendue de votre part', 'st_resolved' => 'Résolue', 'st_closed' => 'Clôturée',
            'err_name' => 'Indiquez votre nom.', 'err_contact' => 'Indiquez un e-mail valide pour recevoir notre réponse.',
            'err_phone' => 'Numéro de téléphone invalide.', 'err_subject' => 'Indiquez un sujet (200 caractères max.).',
            'err_message' => 'Écrivez votre message (10 000 caractères max.).', 'err_limit' => 'Trop d\'envois depuis cette connexion. Réessayez plus tard.',
            'err_session' => 'Votre session a expiré, rechargez la page.',
            'mail_new_subject' => '[#%d] Demande reçue', 'mail_reply_subject' => '[#%d] Réponse à votre demande : %s',
            'mail_hello' => 'Bonjour %s,', 'mail_received' => 'Nous avons bien reçu votre demande. Nous vous répondons au plus vite.',
            'mail_replied' => 'Nous avons répondu à votre demande :', 'mail_link' => 'Suivre et répondre : %s',
            'mail_no_reply' => 'Merci de répondre depuis ce lien plutôt que par e-mail.', 'mail_regards' => 'Cordialement,',
        ],
        'en' => [
            'title' => 'Contact support', 'name' => 'Name', 'email' => 'E-mail (to receive our replies)',
            'phone' => 'Phone (optional)', 'subject' => 'Subject', 'message' => 'Your message', 'send' => 'Send',
            'closed_form' => 'The contact form is closed for now.', 'not_found' => 'Page not found.',
            'ticket' => 'Request #%d', 'you' => 'You', 'support' => 'Support', 'reply' => 'Reply',
            'your_reply' => 'Your reply', 'status' => 'Status', 'keep_link' => 'Keep this link to follow your request and reply.',
            'created' => 'Your request has been received. We will get back to you shortly.',
            'ticket_closed' => 'This request is closed. For a new question, please contact us again.',
            'st_open' => 'In progress', 'st_pending' => 'Waiting for your reply', 'st_resolved' => 'Resolved', 'st_closed' => 'Closed',
            'err_name' => 'Enter your name.', 'err_contact' => 'Enter a valid e-mail to receive our reply.',
            'err_phone' => 'Invalid phone number.', 'err_subject' => 'Enter a subject (200 characters max).',
            'err_message' => 'Write your message (10,000 characters max).', 'err_limit' => 'Too many submissions from this connection. Try again later.',
            'err_session' => 'Your session has expired, please reload the page.',
            'mail_new_subject' => '[#%d] Request received', 'mail_reply_subject' => '[#%d] Reply to your request: %s',
            'mail_hello' => 'Hello %s,', 'mail_received' => 'We have received your request and will get back to you shortly.',
            'mail_replied' => 'We have replied to your request:', 'mail_link' => 'Follow and reply: %s',
            'mail_no_reply' => 'Please reply from this link rather than by e-mail.', 'mail_regards' => 'Kind regards,',
        ],
    ];

    /** @return array<string,string> */
    public static function for(string $lang): array
    {
        return self::TEXT[$lang] ?? self::TEXT['fr'];
    }
}
