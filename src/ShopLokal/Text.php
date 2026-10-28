<?php
/**
 * What shoppers see (shop, order page, e-mails), in the company's document
 * language. The back office stays in French.
 */
declare(strict_types=1);

namespace App\ShopLokal;

final class Text
{
    private const TEXT = [
        'fr' => [
            'shop' => 'Boutique', 'add' => 'Ajouter', 'out' => 'Épuisé', 'left' => 'Plus que %d', 'cart' => 'Votre panier',
            'empty' => 'Votre panier est vide.', 'qty' => 'Quantité', 'remove' => 'Retirer', 'items' => 'Articles',
            'delivery' => 'Livraison', 'pickup' => 'Retrait sur place', 'free' => 'offerte', 'free_from' => 'Livraison offerte dès %s',
            'total' => 'Total TTC', 'name' => 'Nom', 'phone' => 'Téléphone', 'email' => 'E-mail (pour suivre votre commande)',
            'address' => 'Adresse de livraison', 'how' => 'Livraison ou retrait', 'pay' => 'Paiement', 'note' => 'Message (facultatif)',
            'cod' => 'À la livraison ou au retrait', 'bank' => 'Virement bancaire', 'juice' => 'Juice', 'order' => 'Commander',
            'closed' => 'La boutique est fermée pour le moment.', 'not_found' => 'Page introuvable.',
            'order_title' => 'Commande n° %d', 'thanks' => 'Merci ! Votre commande est enregistrée.', 'status' => 'Statut',
            'st_new' => 'Reçue', 'st_confirmed' => 'Confirmée', 'st_shipped' => 'Expédiée', 'st_completed' => 'Terminée', 'st_cancelled' => 'Annulée',
            'paid' => 'Payée', 'unpaid' => 'Paiement attendu', 'pay_bank_how' => 'Virement à : %s — référence : commande %d',
            'pay_juice_how' => 'Juice au %s — référence : commande %d', 'pay_cod_how' => 'Paiement à la livraison ou au retrait.',
            'pickup_at' => 'Retrait : %s', 'deliver_to' => 'Livraison : %s', 'keep_link' => 'Gardez ce lien pour suivre votre commande.',
            'incl_vat' => 'Prix TTC',
            'err_cart' => 'Votre panier est vide.', 'err_name' => 'Indiquez votre nom.', 'err_phone' => 'Indiquez un numéro de téléphone valide.',
            'err_email' => 'L\'e-mail est invalide.', 'err_address' => 'Indiquez l\'adresse de livraison.', 'err_choice' => 'Choix de livraison ou de paiement invalide.',
            'err_product' => '« %s » n\'est plus disponible.', 'err_stock' => 'Il ne reste que %2$d « %1$s ».',
            'err_limit' => 'Trop de commandes depuis cette connexion. Réessayez plus tard ou appelez-nous.',
            'err_session' => 'Votre session a expiré, rechargez la page.',
            'mail_new' => 'Commande n° %d reçue – %s', 'mail_status' => 'Commande n° %d : %s – %s',
            'mail_hello' => 'Bonjour %s,', 'mail_received' => 'Merci pour votre commande. Voici le récapitulatif :',
            'mail_changed' => 'Votre commande est maintenant : %s.', 'mail_link' => 'Suivre la commande : %s', 'mail_regards' => 'Merci,',
        ],
        'en' => [
            'shop' => 'Shop', 'add' => 'Add', 'out' => 'Sold out', 'left' => 'Only %d left', 'cart' => 'Your cart',
            'empty' => 'Your cart is empty.', 'qty' => 'Quantity', 'remove' => 'Remove', 'items' => 'Items',
            'delivery' => 'Delivery', 'pickup' => 'Pickup', 'free' => 'free', 'free_from' => 'Free delivery from %s',
            'total' => 'Total incl. VAT', 'name' => 'Name', 'phone' => 'Phone', 'email' => 'E-mail (to follow your order)',
            'address' => 'Delivery address', 'how' => 'Delivery or pickup', 'pay' => 'Payment', 'note' => 'Message (optional)',
            'cod' => 'On delivery or at pickup', 'bank' => 'Bank transfer', 'juice' => 'Juice', 'order' => 'Place order',
            'closed' => 'The shop is closed for now.', 'not_found' => 'Page not found.',
            'order_title' => 'Order #%d', 'thanks' => 'Thank you! Your order has been received.', 'status' => 'Status',
            'st_new' => 'Received', 'st_confirmed' => 'Confirmed', 'st_shipped' => 'Shipped', 'st_completed' => 'Completed', 'st_cancelled' => 'Cancelled',
            'paid' => 'Paid', 'unpaid' => 'Payment due', 'pay_bank_how' => 'Transfer to: %s — reference: order %d',
            'pay_juice_how' => 'Juice to %s — reference: order %d', 'pay_cod_how' => 'Pay on delivery or at pickup.',
            'pickup_at' => 'Pickup: %s', 'deliver_to' => 'Delivery: %s', 'keep_link' => 'Keep this link to follow your order.',
            'incl_vat' => 'Prices incl. VAT',
            'err_cart' => 'Your cart is empty.', 'err_name' => 'Enter your name.', 'err_phone' => 'Enter a valid phone number.',
            'err_email' => 'The e-mail is invalid.', 'err_address' => 'Enter the delivery address.', 'err_choice' => 'Invalid delivery or payment choice.',
            'err_product' => '"%s" is no longer available.', 'err_stock' => 'Only %2$d "%1$s" left.',
            'err_limit' => 'Too many orders from this connection. Try again later or call us.',
            'err_session' => 'Your session has expired, please reload the page.',
            'mail_new' => 'Order #%d received – %s', 'mail_status' => 'Order #%d: %s – %s',
            'mail_hello' => 'Hello %s,', 'mail_received' => 'Thank you for your order. Here is the summary:',
            'mail_changed' => 'Your order is now: %s.', 'mail_link' => 'Follow the order: %s', 'mail_regards' => 'Thank you,',
        ],
    ];

    /** @return array<string,string> */
    public static function for(string $lang): array
    {
        return self::TEXT[$lang] ?? self::TEXT['fr'];
    }
}
