<?php
/**
 * Wording of the documents a company sends to its clients (printed quote,
 * invoice, credit note, public link page, default e-mail), in the company's
 * document language. The app's own interface stays in French.
 */
declare(strict_types=1);

namespace App\Facturo;

final class DocText
{
    public const LANGUAGES = ['fr' => 'Français', 'en' => 'English'];

    private const TEXT = [
        'fr' => [
            'colon' => ' :', 'percent' => ' %',
            'quote' => 'Devis', 'invoice' => 'Facture', 'vat_invoice' => 'Facture TVA', 'credit_note' => 'Avoir',
            'date' => 'Date', 'relates_to' => 'Se rapporte à la facture', 'valid_until' => 'Valable jusqu\'au',
            'due' => 'Échéance', 'to_quote' => 'Devis pour', 'to_credit_note' => 'Avoir pour', 'to_invoice' => 'Facturé à',
            'vat_no' => 'N° TVA', 'description' => 'Description', 'qty' => 'Qté', 'unit_price' => 'Prix unitaire',
            'vat' => 'TVA', 'amount' => 'Montant HT', 'exempt' => 'Exonéré', 'subtotal' => 'Total HT',
            'total' => 'Total TTC', 'total_credited' => 'Total crédité TTC', 'reason' => 'Motif :',
            'mra_ok' => 'Fiscalisé auprès de la Mauritius Revenue Authority', 'mra_qr' => 'QR code MRA',
            'mra_pending' => 'Pas encore fiscalisé par la MRA — cette copie n\'est pas valable pour la TVA.',
            'print' => 'Imprimer / Enregistrer en PDF', 'not_found' => 'Document introuvable.',
            'mail_quote' => 'Veuillez trouver notre devis %s d\'un montant de %s',
            'mail_invoice' => 'Veuillez trouver la facture %s d\'un montant de %s',
            'mail_credit_note' => 'Veuillez trouver l\'avoir %s d\'un montant de %s',
            'mail_valid_until' => ', valable jusqu\'au %s.', 'mail_due' => ', à régler avant le %s.',
            'mail_relates_to' => ', se rapportant à la facture %s.',
            'mail_hello' => 'Bonjour,', 'mail_regards' => 'Cordialement,',
            'mail_link' => 'Consulter, imprimer ou télécharger : %s', 'mail_button' => 'Voir : %s',
        ],
        'en' => [
            'colon' => ':', 'percent' => '%',
            'quote' => 'Quotation', 'invoice' => 'Invoice', 'vat_invoice' => 'VAT Invoice', 'credit_note' => 'Credit Note',
            'date' => 'Date', 'relates_to' => 'Relates to invoice', 'valid_until' => 'Valid until',
            'due' => 'Due date', 'to_quote' => 'Quotation for', 'to_credit_note' => 'Credit note for', 'to_invoice' => 'Bill to',
            'vat_no' => 'VAT No.', 'description' => 'Description', 'qty' => 'Qty', 'unit_price' => 'Unit price',
            'vat' => 'VAT', 'amount' => 'Amount excl. VAT', 'exempt' => 'Exempt', 'subtotal' => 'Total excl. VAT',
            'total' => 'Total incl. VAT', 'total_credited' => 'Total credited incl. VAT', 'reason' => 'Reason:',
            'mra_ok' => 'Fiscalised with the Mauritius Revenue Authority', 'mra_qr' => 'MRA QR code',
            'mra_pending' => 'Not yet fiscalised by the MRA — this copy is not valid for VAT purposes.',
            'print' => 'Print / Save as PDF', 'not_found' => 'Document not found.',
            'mail_quote' => 'Please find our quotation %s for %s',
            'mail_invoice' => 'Please find invoice %s for %s',
            'mail_credit_note' => 'Please find credit note %s for %s',
            'mail_valid_until' => ', valid until %s.', 'mail_due' => ', payable by %s.',
            'mail_relates_to' => ', relating to invoice %s.',
            'mail_hello' => 'Dear Sir or Madam,', 'mail_regards' => 'Kind regards,',
            'mail_link' => 'View, print or download: %s', 'mail_button' => 'View: %s',
        ],
    ];

    /** @return array<string,string> */
    public static function for(?string $lang): array
    {
        return self::TEXT[self::normalize($lang)];
    }

    public static function normalize(?string $lang): string
    {
        return isset(self::TEXT[(string) $lang]) ? (string) $lang : 'fr';
    }
}
