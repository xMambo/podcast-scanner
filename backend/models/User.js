import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },      // Clerk user ID
    fullName: String,
    email: { type: String, unique: true, required: true },
    created_at: { type: Date, default: Date.now },
});

export default mongoose.model('User', userSchema);
