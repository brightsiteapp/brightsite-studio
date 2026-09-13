// Tasks that aren't linked to a business, kept next to the projects in
// ~/BrightSiteProjects/studio-v2-tasks.json (this computer only). Tasks
// linked to a business live on that business's record instead, so they
// sync with it (see public/v2.js). Same task shape either way.
const fs = require('fs');
const path = require('path');
const { cleanTask } = require('../public/pipeline');

const FILE_NAME = 'studio-v2-tasks.json';
const fileIn = root => path.join(root, FILE_NAME);

function read(root) {
  try {
    const list = JSON.parse(fs.readFileSync(fileIn(root), 'utf8'));
    return Array.isArray(list) ? list.map(cleanTask).filter(t => t.id && t.text) : [];
  } catch {
    return [];
  }
}

// Replaces the whole list — written to a temp file first, so a crash
// mid-write can't leave half a file behind.
function write(root, list) {
  if (!Array.isArray(list)) throw new Error('Tasks must be a list');
  const next = list.map(cleanTask).filter(t => t.id && t.text);
  fs.mkdirSync(root, { recursive: true });
  const tmp = `${fileIn(root)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, fileIn(root));
  return next;
}

module.exports = { FILE_NAME, read, write };
