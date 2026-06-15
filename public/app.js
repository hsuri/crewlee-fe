// ── Waitlist form ────────────────────────────────────────
const form = document.getElementById('waitlistForm');
const submitBtn = document.getElementById('submitBtn');
const formError = document.getElementById('formError');
const successMsg = document.getElementById('successMsg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Joining...';
  formError.classList.remove('visible');

  const data = {
    name: form.name.value,
    email: form.email.value,
    restaurant: form.restaurant.value,
    role: form.role.value,
  };

  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Something went wrong');
    form.style.display = 'none';
    successMsg.classList.add('visible');
  } catch (err) {
    formError.textContent = err.message;
    formError.classList.add('visible');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Join the founding waitlist →';
  }
});

// ── Progress bar ─────────────────────────────────────────
const progressFill = document.getElementById('progressFill');
const progressObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      progressFill.style.width = '70%';
      progressObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });
if (progressFill) progressObserver.observe(progressFill.parentElement);

// ── Scroll-in animations ─────────────────────────────────
const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.fade-up').forEach(el => fadeObserver.observe(el));
