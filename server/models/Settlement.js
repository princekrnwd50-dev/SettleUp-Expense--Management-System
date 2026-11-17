import mongoose from 'mongoose';

const settlementSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer', 'Other'], default: 'Other' },
  paymentDate: { type: Date },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending', index: true },
  paidAt: { type: Date }
}, { timestamps: true, versionKey: false });

settlementSchema.index({ group: 1, status: 1 });

export const Settlement = mongoose.model('Settlement', settlementSchema);
