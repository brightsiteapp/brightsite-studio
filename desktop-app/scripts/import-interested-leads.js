// One-off: add the outreach-tracker businesses marked "Interested" as new
// leads in Studio's pipeline. Run with: node scripts/import-interested-leads.js
const storage = require('../lib/site-storage');
const sync = require('../lib/supabase-sync');

const LEADS = [
  {
    name: 'Rick Roberts Salon',
    category: 'hair',
    location: 'Beverley',
    phone: '01482 872009',
    instagram: 'rickrobertssalon',
    existingWebsite: 'rickrobertshair.com'
  },
  {
    name: 'The Cahaya Skin Clinic',
    category: 'laser & skin',
    location: 'Beverley',
    phone: '07479 686312',
    whatsapp: '447479686312',
    instagram: 'skin_slim_and_laser_solutions',
    email: 'info@thecahayaskinclinic.co.uk',
    existingWebsite: 'thecahayaskinclinic.co.uk'
  }
];

for (const biz of LEADS) {
  const project = storage.createProject(biz.name);
  const raw = { name: biz.name, tagline: biz.category, location: biz.location };
  const contact = {
    phone: biz.phone || '',
    whatsapp: biz.whatsapp || '',
    email: biz.email || '',
    instagram: biz.instagram || '',
    facebookUrl: biz.facebookUrl || '',
    googleUrl: '',
    existingWebsite: biz.existingWebsite || ''
  };
  const saved = storage.saveProject(project.slug, { raw, contact });
  sync.pushOne(saved);
  console.log('Added lead:', saved.name, '->', saved.slug);
}
