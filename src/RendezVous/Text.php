<?php
/**
 * Wording of what a business's customers see: the booking page, the manage
 * link page and the e-mails, in the company's document language.
 * The back office stays in French.
 */
declare(strict_types=1);

namespace App\RendezVous;

final class Text
{
    private const TEXT = [
        'fr' => [
            'title' => 'Prendre rendez-vous', 'service' => 'Prestation', 'staff' => 'Avec',
            'anyone' => 'Peu importe', 'date' => 'Date', 'times' => 'Horaires disponibles',
            'no_times' => 'Aucun horaire disponible ce jour-là. Essayez une autre date.',
            'pick_time' => 'Choisissez un horaire.', 'name' => 'Nom', 'phone' => 'Téléphone',
            'email' => 'E-mail (pour recevoir la confirmation)', 'note' => 'Message (facultatif)',
            'book' => 'Confirmer le rendez-vous', 'min' => 'min', 'closed' => 'La réservation en ligne est fermée pour le moment.',
            'not_found' => 'Page introuvable.', 'confirmed' => 'Rendez-vous confirmé',
            'your_appt' => 'Votre rendez-vous', 'when' => 'Quand', 'with' => 'Avec', 'where' => 'Où',
            'cancel' => 'Annuler ce rendez-vous', 'cancel_confirm' => 'Annuler ce rendez-vous ?',
            'cancelled' => 'Ce rendez-vous est annulé.', 'past' => 'Ce rendez-vous est passé.',
            'keep_link' => 'Gardez ce lien : il permet de consulter ou d\'annuler votre rendez-vous.',
            'cancel_too_late' => 'Il est trop tard pour annuler en ligne. Contactez-nous%s.',
            'call_us' => ' au %s',
            'err_service' => 'Choisissez une prestation.', 'err_name' => 'Indiquez votre nom.',
            'err_phone' => 'Indiquez un numéro de téléphone valide.', 'err_email' => 'L\'e-mail est invalide.',
            'err_date' => 'Date invalide.', 'err_slot' => 'Cet horaire n\'est plus disponible. Choisissez-en un autre.',
            'err_limit' => 'Trop de réservations depuis cette connexion. Réessayez plus tard ou appelez-nous.',
            'err_phone_limit' => 'Vous avez déjà plusieurs rendez-vous à venir. Contactez-nous pour en prendre un autre.',
            'err_session' => 'Votre session a expiré, rechargez la page.',
            'mail_confirm_subject' => 'Rendez-vous confirmé – %s', 'mail_cancel_subject' => 'Rendez-vous annulé – %s',
            'mail_reminder_subject' => 'Rappel : votre rendez-vous – %s',
            'mail_hello' => 'Bonjour %s,', 'mail_confirm' => 'Votre rendez-vous est confirmé :',
            'mail_cancel' => 'Votre rendez-vous a été annulé :', 'mail_reminder' => 'Nous vous rappelons votre rendez-vous :',
            'mail_manage' => 'Consulter ou annuler : %s', 'mail_regards' => 'À bientôt,',
            'mail_staff_new' => 'Nouveau rendez-vous en ligne', 'mail_staff_cancel' => 'Rendez-vous annulé en ligne',
            'at' => 'à',
        ],
        'en' => [
            'title' => 'Book an appointment', 'service' => 'Service', 'staff' => 'With',
            'anyone' => 'Anyone', 'date' => 'Date', 'times' => 'Available times',
            'no_times' => 'No time available on that day. Try another date.',
            'pick_time' => 'Choose a time.', 'name' => 'Name', 'phone' => 'Phone',
            'email' => 'E-mail (to receive the confirmation)', 'note' => 'Message (optional)',
            'book' => 'Confirm the appointment', 'min' => 'min', 'closed' => 'Online booking is closed for now.',
            'not_found' => 'Page not found.', 'confirmed' => 'Appointment confirmed',
            'your_appt' => 'Your appointment', 'when' => 'When', 'with' => 'With', 'where' => 'Where',
            'cancel' => 'Cancel this appointment', 'cancel_confirm' => 'Cancel this appointment?',
            'cancelled' => 'This appointment is cancelled.', 'past' => 'This appointment has passed.',
            'keep_link' => 'Keep this link: you can use it to view or cancel your appointment.',
            'cancel_too_late' => 'It is too late to cancel online. Please contact us%s.',
            'call_us' => ' on %s',
            'err_service' => 'Choose a service.', 'err_name' => 'Enter your name.',
            'err_phone' => 'Enter a valid phone number.', 'err_email' => 'The e-mail is invalid.',
            'err_date' => 'Invalid date.', 'err_slot' => 'This time is no longer available. Please choose another one.',
            'err_limit' => 'Too many bookings from this connection. Try again later or call us.',
            'err_phone_limit' => 'You already have several upcoming appointments. Please contact us to book another one.',
            'err_session' => 'Your session has expired, please reload the page.',
            'mail_confirm_subject' => 'Appointment confirmed – %s', 'mail_cancel_subject' => 'Appointment cancelled – %s',
            'mail_reminder_subject' => 'Reminder: your appointment – %s',
            'mail_hello' => 'Hello %s,', 'mail_confirm' => 'Your appointment is confirmed:',
            'mail_cancel' => 'Your appointment has been cancelled:', 'mail_reminder' => 'This is a reminder of your appointment:',
            'mail_manage' => 'View or cancel: %s', 'mail_regards' => 'See you soon,',
            'mail_staff_new' => 'New online appointment', 'mail_staff_cancel' => 'Appointment cancelled online',
            'at' => 'at',
        ],
    ];

    /** @return array<string,string> */
    public static function for(string $lang): array
    {
        return self::TEXT[$lang] ?? self::TEXT['fr'];
    }
}
