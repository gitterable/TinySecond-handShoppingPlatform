'use strict';

// Attach confirmation dialogs to forms that declare data-confirm.
// Using external JS keeps our Content-Security-Policy free of inline handlers.
document.addEventListener('DOMContentLoaded', function () {
  var forms = document.querySelectorAll('form[data-confirm]');
  forms.forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        e.preventDefault();
      }
    });
  });
});
