// Profile used across the home page. The bio prose lives in src/content/about.md.
export const profile = {
  name: 'Domingo Esteban',
  firstName: 'Domingo',
  lastName: 'Esteban',
  field: 'AI & Robotics', // the small line above the name, before the location
  role: 'Senior Research Engineer',
  focus: 'humanoid robot learning', // after the role in the hero
  company: 'Hexagon Robotics',
  companyHref: 'https://robotics.hexagon.com',
  robot: 'AEON',
  location: 'Zurich, Switzerland',
  origin: 'Arequipa, Peru',
  tagline: 'I teach humanoid robots whole-body skills with reinforcement learning, from simulation to hardware.',
  links: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/domingoesteban/' },
    { label: 'GitHub', href: 'https://github.com/domingoesteban' },
    { label: 'X', href: 'https://x.com/domingoesteban' },
  ],
  // In the hero after the links; not in Contact, as it is not a way to reach me.
  scholar: { label: 'Scholar', href: 'https://scholar.google.com/citations?user=kJh20NUAAAAJ' },
};
