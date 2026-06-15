module.exports = {

  project: {
    name: 'Crewlee',
    slug: 'crewlee',
    tagline: "Your team's brain, always on.",
    subtext: 'Crewlee turns your SOPs, recipes, and checklists into instant answers for your restaurant team.',
    heroSubtext: 'Join the founding restaurant program — only 10 spots.',
  },

  branding: {
    logoImage: '',
    logoText: 'Crewlee',
    logoAlt: 'Crewlee',
    accentColor: '#D97757',
    bgColor: '#FAF8F4',
    secondaryColor: '#6B8E23',
    textColor: '#3A2E2A',
    mutedColor: '#8C7B75',
    fontFamily: "'Inter', sans-serif",
  },

  copy: {
    ctaButton: 'Join the Waitlist',
    submittingButton: 'Joining...',
    successTitle: "You're in!",
    successMessage: "You're officially on the founding waitlist. We'll be reaching out to a small group of operators as we onboard early partners.",
  },

  nav: {
    links: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Founding Program', href: '#founding' },
    ],
    showAdminLink: false,
  },

  footer: {
    copyright: '© 2025 Crewlee. All rights reserved.',
    links: [
      { label: 'Contact', href: 'mailto:hello@crewlee.com' },
    ],
    showAdminLink: false,
  },

  database: {
    name: 'crewlee',
    table: 'waitlist',
    fields: [
      { name: 'name',       label: 'Your Name',       type: 'text',   required: true  },
      { name: 'email',      label: 'Email',           type: 'email',  required: true  },
      { name: 'restaurant', label: 'Restaurant Name', type: 'text',   required: true  },
      { name: 'role',       label: 'Your Role',       type: 'select', required: true,
        selectOptions: ['Owner', 'General Manager', 'Operations Manager', 'Other'] },
    ],
  },

  gcp: {
    projectId: 'pambii-ai-inc',
    region: 'us-central1',
    serviceName: 'crewlee',
    cloudSqlInstance: 'pambii-ai-inc:us-central1:crewlee',
  },
};
