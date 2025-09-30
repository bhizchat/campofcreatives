const jobSelect = document.querySelector('#jobPosition');
const applicationForm = document.querySelector('#applicationForm');
const dialog = document.querySelector('#applyDialog');
const closeDialogBtn = document.querySelector('#closeDialog');
const submitBtn = applicationForm?.querySelector('button[type="submit"]');
let submitting = false;

function applyInitialJobSelection() {
  const params = new URLSearchParams(window.location.search);
  const position = params.get('position');
  if (!position) return;

  const normalized = position.replace(/\+/g, ' ');
  [...jobSelect.options].forEach((option) => {
    if (option.value === normalized) {
      option.selected = true;
    }
  });
  jobSelect.dispatchEvent(new Event('change'));
}

function toggleConditionalSections(group) {
  document
    .querySelectorAll('.conditional')
    .forEach((section) => (section.hidden = !section.classList.contains(`conditional--${group}`)));
}

jobSelect?.addEventListener('change', (event) => {
  const selectedOption = event.target.selectedOptions[0];
  if (!selectedOption) return;
  const group = selectedOption.dataset.group;
  if (!group) {
    document.querySelectorAll('.conditional').forEach((section) => (section.hidden = true));
    return;
  }
  toggleConditionalSections(group);
});

function clearErrors() {
  applicationForm?.querySelectorAll('.field__error').forEach((el) => el.remove());
}

function showFieldError(name, message) {
  const field = applicationForm?.querySelector(`[name="${name}"]`);
  if (!field) return;
  const msg = document.createElement('div');
  msg.className = 'field__error';
  msg.role = 'alert';
  msg.textContent = message;
  const parent = field.closest('.field') || field.parentElement;
  parent?.appendChild(msg);
}

applicationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!applicationForm.reportValidity() || submitting) return;
  clearErrors();
  const formData = new FormData(applicationForm);
  try {
    submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }
    const res = await fetch('/api/apply', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data && data.fields) {
        Object.entries(data.fields).forEach(([key, messages]) => {
          if (Array.isArray(messages) && messages[0]) {
            showFieldError(key, messages[0]);
          }
        });
      }
      alert(data.error || 'Failed to submit application. Please fix the highlighted fields.');
      return;
    }
    dialog?.showModal();
    applicationForm.reset();
    document.querySelectorAll('.conditional').forEach((section) => (section.hidden = true));
  } catch (err) {
    alert('Network error. Please check your connection and try again.');
  } finally {
    submitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Application';
    }
  }
});

closeDialogBtn?.addEventListener('click', () => {
  dialog?.close();
});

applyInitialJobSelection();

