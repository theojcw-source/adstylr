// Run: node --env-file=.env.local sf_seed.mjs
import { MongoClient } from '/Users/t.willems/Styleforge/node_modules/mongodb/lib/index.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI non defini. Lancez avec: node --env-file=.env.local sf_seed.mjs');
  process.exit(1);
}

const templates = [
  {
    id: crypto.randomUUID(),
    label: "Affiche portes ouvertes",
    category: "Evenement",
    prompt: "{{TRIGGER}} open house poster, students collaborating in bright studio, editorial photography, warm natural light, clean space for school name typography",
  },
  {
    id: crypto.randomUUID(),
    label: "Visuel Instagram carre",
    category: "Social",
    prompt: "{{TRIGGER}} square social media visual, student creative project showcase, contemporary graphic layout, vibrant engaging composition, school identity",
  },
  {
    id: crypto.randomUUID(),
    label: "Affiche expo diplomes",
    category: "Exposition",
    prompt: "{{TRIGGER}} graduation exhibition poster, refined student artwork on display, gallery aesthetics, minimal white space, elegant typography room",
  },
  {
    id: crypto.randomUUID(),
    label: "Campagne recrutement",
    category: "Recrutement",
    prompt: "{{TRIGGER}} school recruitment campaign, aspiring young creatives, inspiring studio atmosphere, dynamic energetic composition, bold and professional",
  },
  {
    id: crypto.randomUUID(),
    label: "Couverture brochure",
    category: "Print",
    prompt: "{{TRIGGER}} school prospectus cover, architectural editorial composition, refined materials and textures, soft gradient light, clean layout for title",
  },
  {
    id: crypto.randomUUID(),
    label: "Banniere evenement web",
    category: "Digital",
    prompt: "{{TRIGGER}} wide web event banner, horizontal 16:9 format, clean graphic design, school brand identity, modern professional typographic space",
  },
];

const client = new MongoClient(uri);
await client.connect();
const db = client.db("styleforge");
const col = db.collection("prompt_templates");

const existing = await col.countDocuments();
if (existing > 0) {
  console.log(`${existing} template(s) deja presents. Seed ignore.`);
  await client.close();
  process.exit(0);
}

const result = await col.insertMany(templates.map((t) => ({ ...t, createdAt: new Date() })));
console.log(`${result.insertedCount} templates inseres.`);
await client.close();
