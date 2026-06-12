/**
 * Landing page JS.
 * Reads /api/config/public and applies everything: branding, copy, nav,
 * footer, logo, and form fields. No content is hardcoded in HTML.
 */

(async function () {
  // ── Load config ───────────────────────────────────────────────────────────────
  let cfg = {
    project: { name: '', tagline: '', subtext: '', heroSubtext: '' },
    branding: {
      logoImage: '', logoText: '', logoAlt: '',
      accentColor: '#1a1a1a', bgColor: '#ffffff', secondaryColor: '#f0f0f0',
      textColor: '#1a1a1a', mutedColor: '#888888', fontFamily: 'sans-serif',
    },
    copy: {
      ctaButton: 'Join Waitlist', submittingButton: 'Joining...',
      successTitle: "You're on the list!", successMessage: '',
    },
    nav: { links: [], showAdminLink: true },
    footer: { copyright: '', links: [], showAdminLink: true },
    fields: [],
  };

  try {
    const res = await fetch('/api/config/public');
    if (res.ok) cfg = await res.json();
  } catch (_) {}

  // ── Apply branding via CSS variables ──────────────────────────────────────────
  const b = cfg.branding;
  const root = document.documentElement;
  root.style.setProperty('--accent',    b.accentColor);
  root.style.setProperty('--bg',        b.bgColor);
  root.style.setProperty('--secondary', b.secondaryColor);
  root.style.setProperty('--text',      b.textColor);
  root.style.setProperty('--muted',     b.mutedColor || '#888');
  root.style.setProperty('--font',      b.fontFamily);

  // ── Page title ────────────────────────────────────────────────────────────────
  document.title = cfg.project.name || 'Coming Soon';

  // ── Logo ──────────────────────────────────────────────────────────────────────
  const logoEl = document.getElementById('nav-logo');
  if (b.logoImage) {
    const img = document.createElement('img');
    img.src = b.logoImage;
    img.alt = b.logoAlt || cfg.project.name;
    img.className = 'logo-img';
    logoEl.innerHTML = '';
    logoEl.appendChild(img);
  } else {
    logoEl.textContent = b.logoText || cfg.project.name;
  }

  // ── Nav links ─────────────────────────────────────────────────────────────────
  const navLinks = document.getElementById('nav-links');
  (cfg.nav.links || []).forEach(l => {
    const a = document.createElement('a');
    a.href = l.href; a.textContent = l.label; a.className = 'nav-link';
    navLinks.appendChild(a);
  });
  if (cfg.nav.showAdminLink !== false) {
    const a = document.createElement('a');
    a.href = '/admin.html'; a.textContent = 'Admin'; a.className = 'nav-link nav-link--muted';
    navLinks.appendChild(a);
  }

  // ── Hero ──────────────────────────────────────────────────────────────────────
  document.getElementById('hero-title').textContent = cfg.project.tagline || cfg.project.name;
  document.getElementById('hero-sub').textContent   = cfg.project.heroSubtext || cfg.project.subtext || '';

  // ── Form fields ───────────────────────────────────────────────────────────────
  const container = document.getElementById('form-fields');
  const submitBtn = document.getElementById('submit-btn');

  submitBtn.textContent = cfg.copy.ctaButton || 'Join Waitlist';

  cfg.fields.forEach(field => {
    const wrap = document.createElement('div');
    wrap.className = 'field-wrap';

    const label = document.createElement('label');
    label.setAttribute('for', `field-${field.name}`);
    label.textContent = field.label + (field.required ? ' *' : '');

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      const ph = document.createElement('option');
      ph.value = ''; ph.disabled = true; ph.selected = true;
      ph.textContent = `Select ${field.label}`;
      input.appendChild(ph);
      (field.selectOptions || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      input.placeholder = field.label;
    }

    input.id = `field-${field.name}`;
    input.name = field.name;
    if (field.required) input.required = true;

    wrap.appendChild(label);
    wrap.appendChild(input);
    container.appendChild(wrap);
  });

  // ── Form submission ───────────────────────────────────────────────────────────
  const form = document.getElementById('waitlist-form');
  const successCard = document.getElementById('success-card');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = cfg.copy.submittingButton || 'Joining...';

    const body = {};
    cfg.fields.forEach(f => {
      const el = document.getElementById(`field-${f.name}`);
      if (el) body[f.name] = el.value.trim();
    });

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
    } catch (err) {
      console.warn('[waitlist] Submission error (showing success):', err.message);
    }

    form.style.display = 'none';
    successCard.style.display = 'flex';
    document.getElementById('success-title').textContent =
      cfg.copy.successTitle || "You're on the list!";
    document.getElementById('success-message').textContent =
      cfg.copy.successMessage ||
      `Thanks for your interest in ${cfg.project.name}. We'll be in touch soon.`;
  });

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footerLinks = document.getElementById('footer-links');
  const year = new Date().getFullYear();
  const copyright = cfg.footer.copyright || `© ${year} ${cfg.project.name}`;
  document.getElementById('footer-copy').textContent = copyright;

  (cfg.footer.links || []).forEach(l => {
    addFooterLink(footerLinks, l.label, l.href);
  });
  if (cfg.footer.showAdminLink !== false) {
    addFooterLink(footerLinks, 'Admin', '/admin.html');
  }

  function addFooterLink(container, label, href) {
    const sep = document.createElement('span');
    sep.className = 'footer-sep'; sep.textContent = '·';
    const a = document.createElement('a');
    a.href = href; a.textContent = label; a.className = 'footer-link';
    container.appendChild(sep);
    container.appendChild(a);
  }

  // ── Scroll animations ─────────────────────────────────────────────────────────
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
    { threshold: 0.1 }
  );
  document.querySelectorAll('.hero-content > *').forEach(el => observer.observe(el));
})();
