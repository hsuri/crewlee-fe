/**
 * CENTRAL CONFIG — edit this file for each new project.
 * Everything (server, frontend, scripts) reads from here.
 * Anything you'd change between projects lives here.
 */
module.exports = {

  // ── Project identity ─────────────────────────────────────────────────────────
  project: {
    name: 'My Startup',           // Displayed in nav, title, emails, admin panel
    slug: 'my-startup',           // Lowercase, no spaces — used for service/DB names
    tagline: 'Your tagline here', // Hero headline
    subtext: 'A short description of what you're building and why it matters.',
    heroSubtext: 'Be the first to know when we launch.',
  },

  // ── Branding ──────────────────────────────────────────────────────────────────
  branding: {
    // Logo: set logoImage to a path (e.g. '/logo.png' — place file in public/)
    // or a full URL. Leave empty to use logoText as a text fallback.
    logoImage: '',
    logoText: 'My Startup',      // Shown if logoImage is empty
    logoAlt: 'My Startup logo',

    // Colors — all neutral defaults, easy to swap
    accentColor: '#1a1a1a',      // Primary buttons, links, highlights
    bgColor: '#ffffff',          // Page background
    secondaryColor: '#f0f0f0',   // Cards, success badge, subtle elements
    textColor: '#1a1a1a',
    mutedColor: '#888888',       // Labels, footer text
    fontFamily: "'Inter', sans-serif",
  },

  // ── Copy / wording ────────────────────────────────────────────────────────────
  // Change any of these without touching HTML or JS files
  copy: {
    ctaButton: 'Join Waitlist',
    submittingButton: 'Joining...',
    successTitle: "You're on the list!",
    successMessage: '',  // Leave empty to auto-generate: "Thanks for your interest in {name}..."
  },

  // ── Nav links (shown to the right of the logo) ────────────────────────────────
  // Add { label, href } objects. Admin link is always included at the end.
  nav: {
    links: [
      // { label: 'About', href: '#about' },
      // { label: 'Contact', href: 'mailto:hello@mystartup.com' },
    ],
    showAdminLink: true,
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footer: {
    copyright: '',  // e.g. '© 2025 My Startup. All rights reserved.' — auto-generated if empty
    links: [
      // { label: 'Privacy', href: '/privacy' },
      // { label: 'Contact', href: 'mailto:hello@mystartup.com' },
    ],
    showAdminLink: true,
  },

  // ── Waitlist form fields ──────────────────────────────────────────────────────
  // Each field → DB column + form input + admin table column (all auto-generated)
  // Types: 'text' | 'email' | 'tel' | 'select'
  // For 'select', provide selectOptions: ['Option1', ...]
  database: {
    name: 'mystartup',
    table: 'waitlist',
    fields: [
      { name: 'name',  label: 'Full Name', type: 'text',  required: true  },
      { name: 'email', label: 'Email',     type: 'email', required: true  },
      // Add more fields below as needed:
      // { name: 'company', label: 'Company', type: 'text', required: false },
      // { name: 'role', label: 'I am a...', type: 'select', required: false, selectOptions: ['Founder', 'Investor', 'Other'] },
    ],
  },

  // ── GCP deployment ────────────────────────────────────────────────────────────
  gcp: {
    projectId: 'my-startup-prod',        // GCP project ID — create in GCP console first
    region: 'us-central1',
    serviceName: 'my-startup-waitlist',  // Cloud Run service name
    cloudSqlInstance: '',                // Filled in after setup.sh: PROJECT:REGION:INSTANCE
  },

  // ── Email notifications ───────────────────────────────────────────────────────
  email: {
    from: 'hello@mystartup.com',
    notifyEmails: ['founder@mystartup.com'],
  },
};
