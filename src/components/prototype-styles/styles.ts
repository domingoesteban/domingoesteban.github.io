// PROTOTYPE: registry of the style explorations.
// Round 1 kept: 04, 08, 10. Round 2: 11-17. Round 3: 18-22. Round 4: one at a time from 23.
export const styles: { id: string; name: string; mood: string; bg?: string }[] = [
  { id: '04', name: 'Point Cloud', mood: 'Round 1 · rotating 3D point cloud · Swiss grid' },
  { id: '08', name: 'Trajectory', mood: 'Round 1 · scroll-drawn path · spacious' },
  { id: '10', name: 'Flythrough', mood: 'Round 1 · deep navy · wireframe terrain', bg: '#070b14' },
  { id: '11', name: 'Policy', mood: 'Sticky policy network driving a wheeled humanoid' },
  { id: '12', name: 'Motion Capture', mood: 'Marker skeleton companion that changes pose per section' },
  { id: '13', name: 'Rollouts', mood: 'Thousands of parallel envs converging into one robot' },
  { id: '14', name: 'Sensorium', mood: 'Sticky point cloud that re-forms for every section' },
  { id: '15', name: 'Latent', mood: 'Scroll walks through a latent space of motions' },
  { id: '16', name: 'Kinematic Chain', mood: 'Page spine is a kinematic chain that bends as you scroll' },
  { id: '17', name: 'Daylight', mood: 'Flythrough reimagined in light, with dark mode' },
  { id: '18', name: 'Reflex', mood: 'Round 3 · responsive policy + humanoid that docks right and changes skill per section' },
  { id: '19', name: 'Constellation', mood: 'Round 3 · one set of nodes morphing between policy, humanoid and rollouts' },
  { id: '20', name: 'Ensemble', mood: 'Round 3 · parallel rollouts collapse into one robot that follows you' },
  { id: '21', name: 'Thread', mood: 'Round 3 · a single line down the page that gathers into each section' },
  { id: '22', name: 'Episode', mood: 'Round 3 · one continuous 3D episode, the camera moves with the scroll' },
  { id: '23', name: 'Curriculum', mood: 'Round 4 · nine robots learning different skills; one walks with you between sections' },
];
