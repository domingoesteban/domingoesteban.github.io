// PROTOTYPE: shared content for the style explorations at /prototype/styles/.
// In the real site this would come from Markdown content collections.

export const profile = {
  name: 'Domingo Esteban',
  firstName: 'Domingo',
  lastName: 'Esteban',
  role: 'Robot Learning Researcher & Engineer',
  company: 'Hexagon Robotics',
  companyHref: 'https://hexagon.com',
  robot: 'AEON',
  location: 'Zurich, Switzerland',
  origin: 'Peru',
  tagline: 'I develop intelligent robots that learn, adapt, and make decisions through AI.',
  bio: [
    'My work focuses on AI-driven decision-making and motion intelligence, particularly reinforcement learning, to enable robots to learn new skills, adapt, and operate autonomously in complex environments.',
    'I specialize in reinforcement learning for control and planning, developing adaptive algorithms for locomotion and manipulation, while leveraging massively parallel simulation for skill acquisition and ensuring real-world deployment.',
  ],
  links: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/domingoesteban/' },
    { label: 'GitHub', href: 'https://github.com/domingoesteban' },
    { label: 'X', href: 'https://x.com/domingoesteban' },
  ],
};

export const areas = [
  {
    id: 'learning',
    title: 'Reinforcement learning',
    short: 'Learning',
    summary: 'Deep and hierarchical reinforcement learning for control and planning. Robots that build skills from experience instead of hand-tuned rules.',
    keywords: ['Deep RL', 'Hierarchical RL', 'Planning'],
  },
  {
    id: 'motion',
    title: 'Whole-body motion',
    short: 'Motion',
    summary: 'Motion intelligence for humanoids and legged robots: balancing, rolling, walking and recovering, with the whole body working as one system.',
    keywords: ['Humanoids', 'Wheeled-legged robots', 'Whole-body control', 'Locomotion'],
  },
  {
    id: 'sim2real',
    title: 'Simulation to reality',
    short: 'Sim-to-real',
    summary: 'Massively parallel simulation for skill acquisition, with the real robot as the only benchmark that counts.',
    keywords: ['GPU simulation', 'Domain randomization', 'Deployment'],
  },
];

export const experience = [
  {
    period: 'Now',
    title: 'Robot Learning Researcher & Engineer',
    org: 'Hexagon Robotics',
    place: 'Zurich',
    href: 'https://hexagon.com',
    summary: 'Robot learning for AEON, a wheeled humanoid: whole-body motion learned in simulation and deployed on hardware.',
  },
  {
    period: 'Previously',
    title: 'Senior AI & Robotics Engineer',
    org: 'ANYbotics AG',
    place: 'Zurich',
    href: 'https://www.anybotics.com',
    summary: 'AI-driven motion control systems that enable ANYmal to navigate complex terrain.',
  },
  {
    period: 'Postdoc',
    title: 'Postdoctoral Researcher',
    org: 'Dynamic Legged Systems Lab, IIT',
    place: 'Genoa',
    href: 'https://dls.iit.it/',
    summary: 'Deep reinforcement learning and vision-based locomotion for legged robots.',
  },
  {
    period: 'PhD',
    title: 'PhD in Robotics',
    org: 'Learning and Interaction Group, IIT',
    place: 'Genoa',
    href: 'https://www.iit.it/',
    summary: 'Deep RL for control, hierarchical RL, and behavioral cloning for humanoid robots. Supervised by Prof. Darwin Caldwell and Dr. Leonel Rozo.',
  },
];

// Notes are real Markdown files, to show that each style renders MD content.
type NoteModule = { frontmatter: { title: string; description: string; pubDate: string; tags?: string[] }; url?: string; file: string };
const modules = import.meta.glob<NoteModule>('./notes/*.md', { eager: true });

export const notes = Object.values(modules)
  .map(m => ({ ...m.frontmatter, date: new Date(m.frontmatter.pubDate) }))
  .sort((a, b) => b.date.valueOf() - a.date.valueOf());

export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
