<?php
/**
 * Fixed wording of the public form page, in the company's document language.
 * Questions themselves are written by the business.
 */
declare(strict_types=1);

namespace App\Formelio;

final class Text
{
    private const TEXT = [
        'fr' => [
            'submit' => 'Envoyer', 'required' => 'obligatoire', 'choose' => 'Choisir…',
            'nps_low' => 'Pas du tout probable', 'nps_high' => 'Très probable',
            'thanks' => 'Merci, votre réponse a bien été envoyée.', 'closed' => 'Ce formulaire n\'accepte plus de réponses.',
            'not_found' => 'Formulaire introuvable.', 'preview' => 'Aperçu : le formulaire n\'est pas ouvert, l\'envoi est désactivé.',
            'privacy' => 'Vos réponses sont transmises à %s.', 'already' => 'Vous avez déjà répondu. Merci !',
            'err_required' => '« %s » est obligatoire.', 'err_email' => '« %s » : e-mail invalide.',
            'err_phone' => '« %s » : numéro invalide.', 'err_number' => '« %s » : nombre invalide.',
            'err_date' => '« %s » : date invalide.', 'err_choice' => '« %s » : choix invalide.',
            'err_long' => '« %s » : réponse trop longue.', 'err_limit' => 'Trop d\'envois depuis cette connexion. Réessayez plus tard.',
            'err_session' => 'Votre session a expiré, rechargez la page.',
            'mail_subject' => 'Nouvelle réponse : %s',
        ],
        'en' => [
            'submit' => 'Send', 'required' => 'required', 'choose' => 'Choose…',
            'nps_low' => 'Not at all likely', 'nps_high' => 'Extremely likely',
            'thanks' => 'Thank you, your answer has been sent.', 'closed' => 'This form no longer accepts answers.',
            'not_found' => 'Form not found.', 'preview' => 'Preview: the form is not open, sending is disabled.',
            'privacy' => 'Your answers are sent to %s.', 'already' => 'You have already answered. Thank you!',
            'err_required' => '"%s" is required.', 'err_email' => '"%s": invalid e-mail.',
            'err_phone' => '"%s": invalid number.', 'err_number' => '"%s": invalid number.',
            'err_date' => '"%s": invalid date.', 'err_choice' => '"%s": invalid choice.',
            'err_long' => '"%s": answer too long.', 'err_limit' => 'Too many submissions from this connection. Try again later.',
            'err_session' => 'Your session has expired, please reload the page.',
            'mail_subject' => 'New response: %s',
        ],
    ];

    /** @return array<string,string> */
    public static function for(string $lang): array
    {
        return self::TEXT[$lang] ?? self::TEXT['fr'];
    }
}
