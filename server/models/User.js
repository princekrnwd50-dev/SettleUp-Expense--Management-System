import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true, versionKey: false });

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return { id: this._id.toString(), name: this.name, email: this.email, avatar: this.avatar };
};

export const User = mongoose.model('User', userSchema);
