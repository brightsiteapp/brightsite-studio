// A small shared queue of things a customer asked for, written here by
// this file's callers (the leads poll in server.js for "Request an
// update"/domain-change submissions, and the billing refresh for a
// cancellation with a reason) and turned into Tasks by
// desktop-app-v2/lib/tasks.js's own poll — V1 has no concept of tasks, so
// it only ever writes to this queue, never reads it back.
// ~/BrightSiteProjects/customer-requests.json, this computer only.
const fs = require('fs');
const path = require('path');
const storage = require('./site-storage');

const FILE_NAME = 'customer-requests.json';
const fileIn = root => path.join(root, FILE_NAME);

function readState(root = storage.ROOT) {
  try {
    const state = JSON.parse(fs.readFileSync(fileIn(root), 'utf8'));
    return { lastLeadId: state.lastLeadId || 0, requests: Array.isArray(state.requests) ? state.requests : [] };
  } catch {
    return { lastLeadId: 0, requests: [] };
  }
}

function writeState(state, root = storage.ROOT) {
  storage.ensureRoot();
  const tmp = `${fileIn(root)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, fileIn(root));
}

// type: 'update' | 'domain' | 'cancellation'. `dedupeKey` stops the same
// real-world event (e.g. the same cancelling subscription) being queued
// twice if a poll runs again before it's been converted to a task.
function queueRequest(entry, root = storage.ROOT) {
  const state = readState(root);
  if (entry.dedupeKey && state.requests.some(r => r.dedupeKey === entry.dedupeKey)) return;
  state.requests.push({
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    converted: false,
    ...entry
  });
  writeState(state, root);
}

function pending(root = storage.ROOT) {
  return readState(root).requests.filter(r => !r.converted);
}

// Called once each request has become a Task, so the next read skips it.
function markConverted(ids, root = storage.ROOT) {
  const state = readState(root);
  const idSet = new Set(ids);
  state.requests = state.requests.map(r => (idSet.has(r.id) ? { ...r, converted: true } : r));
  writeState(state, root);
}

function getLastLeadId(root = storage.ROOT) {
  return readState(root).lastLeadId;
}

function setLastLeadId(id, root = storage.ROOT) {
  const state = readState(root);
  state.lastLeadId = Math.max(state.lastLeadId, Number(id) || 0);
  writeState(state, root);
}

module.exports = { queueRequest, pending, markConverted, getLastLeadId, setLastLeadId };
