const waitlistForm = document.querySelector('#waitlistForm');
const waitlistDialog = document.querySelector('#waitlistDialog');
const closeWaitlistDialog = document.querySelector('#closeWaitlistDialog');
const submitBtn = waitlistForm?.querySelector('button[type="submit"]');
let submitting = false;

waitlistForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!waitlistForm.reportValidity() || submitting) return;
  const formData = new FormData(waitlistForm);
  const platforms = [];
  formData.getAll('platform').forEach((v) => platforms.push(String(v)));
  const payload = {
    firstName: formData.get('firstName')?.toString() || '',
    email: formData.get('email')?.toString() || '',
    experience: formData.get('experience')?.toString() || '',
    hype: formData.get('hype')?.toString() || '',
    platform: platforms,
    earlyAccess: Boolean(formData.get('earlyAccess')),
    consent: Boolean(formData.get('consent')),
  };

  try {
    submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to save your spot. Please try again.');
      return;
    }
    waitlistDialog?.showModal();
    waitlistForm.reset();
  } catch (err) {
    alert('Network error. Please check your connection and try again.');
  } finally {
    submitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save my spot';
    }
  }
});

closeWaitlistDialog?.addEventListener('click', () => {
  waitlistDialog?.close();
  window.location.href = 'index.html';
});

