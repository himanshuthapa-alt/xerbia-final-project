const mongoose = require('mongoose');

// Tiny counter collection used to mint sequential business IDs (EMP0001, CAND0001 ...).
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Atomically returns the next id for a named sequence.
 * e.g. nextId('employee', 'EMP', 4) -> "EMP0001"
 */
async function nextId(name, prefix, pad = 4) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}${String(doc.seq).padStart(pad, '0')}`;
}

module.exports = { nextId };
