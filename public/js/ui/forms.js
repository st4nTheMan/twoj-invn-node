// Adds lightweight client-side validation for required form fields.
(function initFormValidationUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    // Checks whether a required field is currently blank.
    function isFieldEmpty(field) {
      return !field.value.trim();
    }

    // Chooses the DOM node that should host the validation error message.
    function getFieldErrorHost(field) {
      const parent = field.parentElement;
      if (!parent) return field;

      return window.getComputedStyle(parent).display === "flex" ? parent : field;
    }

    // Applies invalid styling and ensures an inline error message is shown.
    function setFieldError(field, message = "This field is required.") {
      field.classList.add("field-invalid");
      field.setAttribute("aria-invalid", "true");

      const errorHost = getFieldErrorHost(field);
      let errorMessage = errorHost.nextElementSibling;
      if (!errorMessage?.classList.contains("field-error-message")) {
        errorMessage = null;
      }

      if (!errorMessage) {
        errorMessage = document.createElement("p");
        errorMessage.className = "field-error-message";
        errorHost.insertAdjacentElement("afterend", errorMessage);
      }

      errorMessage.textContent = message;
    }

    // Removes invalid styling and any inline error message for a field.
    function clearFieldError(field) {
      field.classList.remove("field-invalid");
      field.removeAttribute("aria-invalid");

      const errorMessage = getFieldErrorHost(field).nextElementSibling;
      if (errorMessage?.classList.contains("field-error-message")) {
        errorMessage.remove();
      }
    }

    document.querySelectorAll("form").forEach((form) => {
      const requiredFields = form.querySelectorAll("[data-required='true']");
      if (!requiredFields.length) return;

      form.noValidate = true;

      requiredFields.forEach((field) => {
        const clearError = () => {
          if (!isFieldEmpty(field)) {
            clearFieldError(field);
          }
        };

        field.addEventListener("input", clearError);
        field.addEventListener("change", clearError);
      });

      form.addEventListener("submit", (event) => {
        let firstInvalidField = null;

        requiredFields.forEach((field) => {
          if (isFieldEmpty(field)) {
            setFieldError(field);
            if (!firstInvalidField) {
              firstInvalidField = field;
            }
            return;
          }

          clearFieldError(field);
        });

        if (!firstInvalidField) return;

        event.preventDefault();
        firstInvalidField.focus();
      });
    });
  });
}());
