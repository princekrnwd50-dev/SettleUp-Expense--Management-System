import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'member'], default: 'member' }
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  color: { type: String, trim: true, default: '#2c7a7b', maxlength: 20 },
  inviteCode: { type: String, required: true, unique: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: { type: [memberSchema], validate: (members) => members.length > 0 }
}, { timestamps: true, versionKey: false });

groupSchema.index({ 'members.user': 1 });

export const Group = mongoose.model('Group', groupSchema);
