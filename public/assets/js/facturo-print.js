/**
 * Print page: the toolbar button opens the browser print dialog
 * (where "Save as PDF" produces the PDF).
 */
(function () {
    'use strict';
    document.getElementById('print-btn').addEventListener('click', function () {
        window.print();
    });
})();
