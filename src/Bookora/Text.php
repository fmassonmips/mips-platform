<?php
/**
 * What guests see (booking page, booking page per stay, e-mails), in the
 * company's document language. The back office stays in French.
 */
declare(strict_types=1);

namespace App\Bookora;

final class Text
{
    private const TEXT = [
        'fr' => [
            'title' => 'Réserver', 'check_in' => 'Arrivée', 'check_out' => 'Départ', 'guests' => 'Personnes', 'search' => 'Voir les disponibilités',
            'closed' => 'Les réservations en ligne sont fermées pour le moment.', 'not_found' => 'Page introuvable.',
            'up_to' => 'Jusqu\'à %d personnes', 'from' => 'À partir de %s / nuit', 'min_nights' => 'Séjour de %d nuits minimum',
            'available' => 'Disponible', 'unavailable' => 'Indisponible à ces dates', 'nights' => '%d nuit(s)', 'total' => 'Total TTC',
            'choose' => 'Réserver ce logement', 'none' => 'Aucun logement disponible à ces dates.', 'per_night' => '/ nuit',
            'your_details' => 'Vos coordonnées', 'name' => 'Nom', 'phone' => 'Téléphone', 'email' => 'E-mail (pour recevoir la confirmation)',
            'note' => 'Message (heure d\'arrivée, demande particulière)', 'send' => 'Envoyer la demande', 'back' => '← Autres logements',
            'deposit' => 'Acompte demandé : %s', 'no_deposit' => 'Aucun acompte demandé.', 'incl_vat' => 'Prix TTC',
            'line' => '%1$s — %2$d nuit(s) du %3$s au %4$s', 'season' => ' (%s)',
            'booking_title' => 'Réservation n° %d', 'thanks' => 'Merci ! Votre demande est envoyée.', 'status' => 'Statut',
            'st_new' => 'En attente de confirmation', 'st_confirmed' => 'Confirmée', 'st_cancelled' => 'Annulée', 'st_expired' => 'Expirée',
            'hold' => 'Les dates vous sont réservées jusqu\'au %s. Le logement vous confirme la réservation dès réception de l\'acompte.',
            'hold_no_deposit' => 'Les dates vous sont réservées jusqu\'au %s, le temps que le logement confirme.',
            'pay_bank' => 'Virement à : %s — référence : réservation %d', 'pay_juice' => 'Juice au %s — référence : réservation %d',
            'pay_contact' => 'Le logement vous contactera pour le paiement.',
            'arrival' => 'Arrivée le %1$s à partir de %2$s · départ le %3$s avant %4$s', 'cancel' => 'Annuler ma demande',
            'cancel_confirm' => 'Annuler cette demande de réservation ?', 'keep_link' => 'Gardez ce lien pour suivre votre réservation.',
            'deposit_received' => 'Acompte reçu', 'paid' => 'Séjour payé',
            'err_dates' => 'Choisissez des dates valides (départ après l\'arrivée, pas dans le passé).', 'err_long' => 'Séjour de 60 nuits au plus.',
            'err_far' => 'Réservations ouvertes jusqu\'à 18 mois à l\'avance.', 'err_min' => 'Ce logement se réserve pour %d nuits minimum.',
            'err_guests' => 'Ce logement accueille %d personnes au plus.', 'err_taken' => 'Ces dates ne sont plus disponibles pour ce logement.',
            'err_name' => 'Indiquez votre nom.', 'err_phone' => 'Indiquez un numéro de téléphone valide.', 'err_email' => 'L\'e-mail est invalide.',
            'err_unit' => 'Logement introuvable.', 'err_limit' => 'Trop de demandes depuis cette connexion. Réessayez plus tard ou appelez-nous.',
            'err_session' => 'Votre session a expiré, rechargez la page.', 'err_cancel' => 'Cette demande ne peut plus être annulée en ligne : contactez le logement.',
            'mail_new' => 'Demande de réservation n° %d – %s', 'mail_confirmed' => 'Réservation n° %d confirmée – %s', 'mail_cancelled' => 'Réservation n° %d annulée – %s',
            'mail_hello' => 'Bonjour %s,', 'mail_received' => 'Nous avons bien reçu votre demande :', 'mail_is_confirmed' => 'Votre réservation est confirmée :',
            'mail_is_cancelled' => 'Votre réservation est annulée :', 'mail_link' => 'Suivre la réservation : %s', 'mail_regards' => 'À bientôt,',
        ],
        'en' => [
            'title' => 'Book', 'check_in' => 'Check-in', 'check_out' => 'Check-out', 'guests' => 'Guests', 'search' => 'See availability',
            'closed' => 'Online booking is closed for now.', 'not_found' => 'Page not found.',
            'up_to' => 'Up to %d guests', 'from' => 'From %s / night', 'min_nights' => 'Minimum stay %d nights',
            'available' => 'Available', 'unavailable' => 'Not available on these dates', 'nights' => '%d night(s)', 'total' => 'Total incl. VAT',
            'choose' => 'Book this place', 'none' => 'Nothing is available on these dates.', 'per_night' => '/ night',
            'your_details' => 'Your details', 'name' => 'Name', 'phone' => 'Phone', 'email' => 'E-mail (to receive the confirmation)',
            'note' => 'Message (arrival time, special request)', 'send' => 'Send the request', 'back' => '← Other places',
            'deposit' => 'Deposit requested: %s', 'no_deposit' => 'No deposit requested.', 'incl_vat' => 'Prices incl. VAT',
            'line' => '%1$s — %2$d night(s) from %3$s to %4$s', 'season' => ' (%s)',
            'booking_title' => 'Booking #%d', 'thanks' => 'Thank you! Your request has been sent.', 'status' => 'Status',
            'st_new' => 'Awaiting confirmation', 'st_confirmed' => 'Confirmed', 'st_cancelled' => 'Cancelled', 'st_expired' => 'Expired',
            'hold' => 'The dates are held for you until %s. Your host confirms the booking once the deposit is received.',
            'hold_no_deposit' => 'The dates are held for you until %s while your host confirms.',
            'pay_bank' => 'Transfer to: %s — reference: booking %d', 'pay_juice' => 'Juice to %s — reference: booking %d',
            'pay_contact' => 'Your host will contact you about payment.',
            'arrival' => 'Check-in on %1$s from %2$s · check-out on %3$s before %4$s', 'cancel' => 'Cancel my request',
            'cancel_confirm' => 'Cancel this booking request?', 'keep_link' => 'Keep this link to follow your booking.',
            'deposit_received' => 'Deposit received', 'paid' => 'Stay paid',
            'err_dates' => 'Choose valid dates (check-out after check-in, not in the past).', 'err_long' => 'Stays of 60 nights at most.',
            'err_far' => 'Bookings open up to 18 months ahead.', 'err_min' => 'This place is booked for %d nights minimum.',
            'err_guests' => 'This place sleeps %d guests at most.', 'err_taken' => 'These dates are no longer available for this place.',
            'err_name' => 'Enter your name.', 'err_phone' => 'Enter a valid phone number.', 'err_email' => 'The e-mail is invalid.',
            'err_unit' => 'Place not found.', 'err_limit' => 'Too many requests from this connection. Try again later or call us.',
            'err_session' => 'Your session has expired, please reload the page.', 'err_cancel' => 'This request can no longer be cancelled online: contact your host.',
            'mail_new' => 'Booking request #%d – %s', 'mail_confirmed' => 'Booking #%d confirmed – %s', 'mail_cancelled' => 'Booking #%d cancelled – %s',
            'mail_hello' => 'Hello %s,', 'mail_received' => 'We have received your request:', 'mail_is_confirmed' => 'Your booking is confirmed:',
            'mail_is_cancelled' => 'Your booking is cancelled:', 'mail_link' => 'Follow the booking: %s', 'mail_regards' => 'See you soon,',
        ],
    ];

    /**
     * @return array<string,string>
     */
    public static function for(string $lang): array
    {
        return self::TEXT[$lang] ?? self::TEXT['fr'];
    }
}
