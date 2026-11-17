import { Router } from 'express';
import { z } from 'zod';

import { Expense } from '../models/Expense.js';
import { Group } from '../models/Group.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getMemberGroup, memberIds } from '../utils/group.js';

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');
const splitInput = z.object({
  userId: objectId.optional(),
  user: objectId.optional(),
  value: z.coerce.number().finite().min(0).optional(),
  amount: z.coerce.number().finite().min(0).optional(),
  percentage: z.coerce.number().finite().min(0).max(100).optional()
}).refine(({ userId, user }) => Boolean(userId || user), {
  path: ['userId'], message: 'A split user is required'
}).refine(({ value, amount, percentage }) => [value, amount, percentage].filter((item) => item !== undefined).length <= 1, {
  path: ['value'], message: 'Provide only one split value'
}).transform(({ userId, user, value, amount, percentage }) => ({
  userId: userId || user,
  value: value ?? percentage ?? amount ?? 0
}));
const expenseFields = z.object({
  groupId: objectId,
  description: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(50).default('Other'),
  amount: z.coerce.number().finite().positive(),
  paidBy: objectId,
  date: z.coerce.date().default(() => new Date()),
  splitType: z.enum(['equal', 'percentage', 'custom', 'shares']).default('equal'),
  title: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional().default(''),
  receipt: z.string().max(7000000).optional(),
  splits: z.array(splitInput).max(100).default([])
});
const idParams = z.object({ id: objectId });
const querySchema = z.object({ groupId: objectId.optional() });

const roundMoney = (value) => Math.round(value * 100) / 100;

function distribute(total, users, amounts) {
  const totalCents = Math.round(total * 100);
  const values = users.map((user) => Math.max(0, Math.round((amounts[user] || 0) * 100)));
  const difference = totalCents - values.reduce((sum, value) => sum + value, 0);
  if (values.length) values[values.length - 1] += difference;
  return users.map((user, index) => ({ user, amount: values[index] / 100 }));
}

function buildSplits(input, group) {
  const ids = memberIds(group);
  if (!ids.includes(input.paidBy)) throw new AppError('Payer must be a group member', 400);

  const requested = input.splits;
  if (input.splitType === 'equal') {
    if (requested.length && requested.some((split) => !ids.includes(split.userId))) {
      throw new AppError('All split users must be group members', 400);
    }
    const participantIds = requested.length ? requested.map((split) => split.userId) : ids;
    if (new Set(participantIds).size !== participantIds.length) {
      throw new AppError('Splits must contain unique group members', 400);
    }
    return distribute(input.amount, participantIds, Object.fromEntries(
      participantIds.map((id) => [id, input.amount / participantIds.length])
    ));
  }
  if (!requested.length) throw new AppError('Splits are required for percentage and custom expenses', 400);
  const splitIds = requested.map((split) => split.userId);
  if (new Set(splitIds).size !== splitIds.length || splitIds.some((id) => !ids.includes(id))) {
    throw new AppError('Splits must contain unique group members', 400);
  }

  if (input.splitType === 'percentage') {
    const percentageTotal = requested.reduce((sum, split) => sum + split.value, 0);
    if (Math.abs(percentageTotal - 100) > 0.01) {
      throw new AppError('Percentage splits must add up to 100', 400);
    }
    return requested.map((split, index) => ({
      user: split.userId,
      percentage: split.value,
      amount: index === requested.length - 1
        ? 0
        : roundMoney(input.amount * split.value / 100)
    })).map((split, index, all) => ({
      ...split,
      amount: index === all.length - 1
        ? roundMoney(input.amount - all.slice(0, -1).reduce((sum, item) => sum + item.amount, 0))
        : split.amount
    }));
  }

  if (input.splitType === 'shares') {
    const totalShares = requested.reduce((sum, split) => sum + split.value, 0);
    if (!totalShares || requested.some((split) => !Number.isInteger(split.value) || split.value <= 0)) {
      throw new AppError('Shares must be positive whole numbers', 400);
    }
    const cents = Math.round(input.amount * 100);
    const values = requested.map((split) => Math.floor(cents * split.value / totalShares));
    for (let index = 0; index < cents - values.reduce((sum, value) => sum + value, 0); index += 1) values[index % values.length] += 1;
    return requested.map((split, index) => ({ user: split.userId, amount: values[index] / 100 }));
  }

  const total = requested.reduce((sum, split) => sum + split.value, 0);
  if (Math.abs(total - input.amount) > 0.01) throw new AppError('Custom splits must add up to the expense amount', 400);
  return distribute(input.amount, splitIds, Object.fromEntries(requested.map((split) => [split.userId, split.value])));
}

function responseQuery(query) {
  return query.populate([
    { path: 'paidBy', select: 'name email avatar' },
    { path: 'createdBy', select: 'name email avatar' },
    { path: 'splits.user', select: 'name email avatar' }
  ]);
}

router.use(requireAuth);

router.get('/', validate(querySchema, 'query'), asyncHandler(async (req, res) => {
  const filter = req.query.groupId ? { group: req.query.groupId } : {};
  const groups = await Group.find({ 'members.user': req.user._id, ...(req.query.groupId ? { _id: req.query.groupId } : {}) }).select('_id');
  const allowed = new Set(groups.map((group) => group._id.toString()));
  const groupIds = req.query.groupId ? (allowed.has(req.query.groupId) ? [req.query.groupId] : []) : [...allowed];
  const expenses = await responseQuery(Expense.find({ ...filter, group: { $in: groupIds } }).sort({ date: -1 }));
  res.json({ expenses });
}));

router.post('/', validate(expenseFields), asyncHandler(async (req, res) => {
  const group = await getMemberGroup(req.body.groupId, req.user._id);
  const splits = buildSplits(req.body, group);
  const expense = await Expense.create({
    ...req.body,
    group: req.body.groupId,
    createdBy: req.user._id,
    splits
  });
  res.status(201).json({ expense: await responseQuery(expense) });
}));

router.get('/:id', validate(idParams, 'params'), asyncHandler(async (req, res) => {
  const expense = await responseQuery(Expense.findById(req.params.id));
  if (!expense) throw new AppError('Expense not found', 404);
  await getMemberGroup(expense.group, req.user._id);
  res.json({ expense });
}));

router.patch('/:id', validate(idParams, 'params'), validate(expenseFields.partial().omit({ groupId: true })), asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new AppError('Expense not found', 404);
  const group = await getMemberGroup(expense.group, req.user._id);
  const merged = {
    groupId: expense.group.toString(),
    description: expense.description,
    category: expense.category,
    amount: expense.amount,
    paidBy: expense.paidBy.toString(),
    date: expense.date,
    splitType: expense.splitType,
    splits: expense.splits.map((split) => ({ userId: split.user.toString(), value: expense.splitType === 'percentage' ? split.percentage : split.amount })),
    ...req.body
  };
  expense.set({ ...req.body, splits: buildSplits(merged, group) });
  await expense.save();
  res.json({ expense: await responseQuery(expense) });
}));

router.delete('/:id', validate(idParams, 'params'), asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new AppError('Expense not found', 404);
  const group = await getMemberGroup(expense.group, req.user._id);
  if (expense.createdBy.toString() !== req.user._id.toString() && group.owner.toString() !== req.user._id.toString()) {
    throw new AppError('Only the creator or group owner can delete this expense', 403);
  }
  await expense.deleteOne();
  res.status(204).send();
}));

export default router;
