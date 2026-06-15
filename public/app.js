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

// ── Mobile carousels ──────────────────────────────────────
function initCarousels() {
  if (window.innerWidth > 640) return;

  ['.answers-grid', '.who-grid', '.problem-grid'].forEach(selector => {
    const grid = document.querySelector(selector);
    if (!grid) return;

    const cards = Array.from(grid.children);
    const count = cards.length;
    let current = 0;
    let timer = null;

    function cardWidth() {
      const gap = parseInt(getComputedStyle(grid).gap) || 12;
      return cards[0].offsetWidth + gap;
    }

    function scrollTo(idx) {
      current = Math.max(0, Math.min(idx, count - 1));
      grid.scrollTo({ left: current * cardWidth(), behavior: 'smooth' });
      sync();
    }

    function sync() {
      dotEls.forEach((d, i) => d.classList.toggle('active', i === current));
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === count - 1;
    }

    function startAuto() {
      clearInterval(timer);
      timer = setInterval(() => {
        scrollTo(current < count - 1 ? current + 1 : 0);
      }, 3500);
    }

    function pauseAuto(resumeAfter = 4000) {
      clearInterval(timer);
      setTimeout(startAuto, resumeAfter);
    }

    // Build controls: [←] dots [→]
    const controls = document.createElement('div');
    controls.className = 'carousel-controls';

    prevBtn = document.createElement('button');
    prevBtn.className = 'carousel-arrow';
    prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    prevBtn.disabled = true;
    prevBtn.addEventListener('click', () => { scrollTo(current - 1); pauseAuto(); });

    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'carousel-dots';
    cards.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => { scrollTo(i); pauseAuto(); });
      dotsWrap.appendChild(dot);
    });

    nextBtn = document.createElement('button');
    nextBtn.className = 'carousel-arrow';
    nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    nextBtn.addEventListener('click', () => { scrollTo(current + 1); pauseAuto(); });

    controls.append(prevBtn, dotsWrap, nextBtn);
    grid.after(controls);

    const dotEls = dotsWrap.querySelectorAll('.carousel-dot');

    // Sync on manual swipe
    grid.addEventListener('scroll', () => {
      const idx = Math.min(Math.round(grid.scrollLeft / cardWidth()), count - 1);
      if (idx !== current) { current = idx; sync(); }
    }, { passive: true });

    // Pause auto on touch
    grid.addEventListener('touchstart', () => pauseAuto(), { passive: true });

    startAuto();
    sync();
  });
}

initCarousels();
