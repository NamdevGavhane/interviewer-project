const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  seq: {
    type: Number,
    default: 0
  }
});

counterSchema.statics.getNextSequence = async function(key) {
  const result = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return result.seq;
};

// Returns atomic financial invoice number in format INV-YYYY-XXXXXX
counterSchema.statics.getNextInvoiceNumber = async function() {
  const year = new Date().getFullYear();
  const key = `invoice_${year}`;
  const seq = await this.getNextSequence(key);
  const padded = String(seq).padStart(6, '0');
  return `INV-${year}-${padded}`;
};

module.exports = mongoose.model('Counter', counterSchema);
