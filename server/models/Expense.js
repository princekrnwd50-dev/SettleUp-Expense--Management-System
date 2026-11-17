import mongoose from 'mongoose';

const splitSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0 },
  percentage: { type: Number, min: 0, max: 100 }
}, { _id: false });

const expenseSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true, trim: true, maxlength: 200 },
  title: { type: String, trim: true, maxlength: 200 },
  category: { type: String, trim: true, maxlength: 50, default: 'Other' },
  amount: { type: Number, required: true, min: 0.01 },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true, default: Date.now },
  splitType: { type: String, enum: ['equal', 'percentage', 'custom', 'shares'], required: true, default: 'equal' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  receipt: { type: String, trim: true, maxlength: 7000000 },
  splits: { type: [splitSchema], required: true, validate: (splits) => splits.length > 0 }
}, { timestamps: true, versionKey: false });

expenseSchema.index({ group: 1, date: -1 });
expenseSchema.pre('validate', function validateSplits(next) {
  const totalCents = this.splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0);
  if (totalCents !== Math.round(this.amount * 100)) {
    this.invalidate('splits', 'Split amounts must equal the expense amount');
  }
  if (this.splitType === 'percentage') {
    const percentageTotal = this.splits.reduce((sum, split) => sum + (split.percentage || 0), 0);
    if (Math.abs(percentageTotal - 100) > 0.01) {
      this.invalidate('splits', 'Percentage splits must equal 100');
    }
  }
  next();
});

export const Expense = mongoose.model('Expense', expenseSchema);
