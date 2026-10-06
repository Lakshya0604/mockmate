import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  { name: { type: String, trim: true, maxlength: 80 }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true } },
  { timestamps: true }
);

const qaSchema = new mongoose.Schema(
  {
    question: String,
    topic: String,
    answer: String,
    score: Number,
    feedback: String,
    strengths: [String],
    improvements: [String],
    betterAnswer: String,
    answeredAt: Date
  },
  { _id: false }
);

const interviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    role: String,
    level: String,
    focus: String,
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    current: { type: Number, default: 0 },
    questions: [qaSchema],
    overall: Number,
    verdict: String,
    report: Object
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Interview = mongoose.models.Interview || mongoose.model('Interview', interviewSchema);
