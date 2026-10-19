import mongoose from 'mongoose';

export const USER_ROLES = ['System Admin', 'Sales', 'Accountant', 'Client'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: USER_ROLES, default: 'Client' },
  tenantId: { type: String, required: true, index: true },
  title: { type: String, trim: true, maxlength: 120, default: '' },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
