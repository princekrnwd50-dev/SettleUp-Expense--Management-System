import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { Expense } from '../models/Expense.js';
import { Group } from '../models/Group.js';
import { Settlement } from '../models/Settlement.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getMemberGroup, isOwner } from '../utils/group.js';
import { calculateBalances, simplifyBalances } from '../utils/balances.js';

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');
const groupIdParams = z.object({ groupId: objectId });
const idParams = z.object({ id: objectId });
const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(''),
  color: z.string().trim().max(20).optional().default('#2c7a7b'),
  memberIds: z.array(objectId).max(100).optional().default([])
});
const updateSchema = createSchema.omit({ memberIds: true }).partial();
const joinSchema = z.object({ inviteCode: z.string().trim().min(4).max(40) });

function inviteCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

async function populated(group) {
  return group.populate('members.user', 'name email avatar');
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const groups = await Group.find({ 'members.user': req.user._id })
    .populate('members.user', 'name email avatar').sort({ updatedAt: -1 });
  res.json({ groups });
}));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const { memberIds: requestedMemberIds, ...groupFields } = req.body;
  const memberIds = [...new Set([req.user._id.toString(), ...requestedMemberIds])];
  const users = await User.find({ _id: { $in: memberIds } }).select('_id');
  if (users.length !== memberIds.length) throw new AppError('One or more members do not exist', 400);
  const group = await Group.create({
    ...groupFields,
    owner: req.user._id,
    inviteCode: inviteCode(),
    members: memberIds.map((user, index) => ({ user, role: index === 0 ? 'owner' : 'member' }))
  });
  res.status(201).json({ group: await populated(group) });
}));

router.post('/join', validate(joinSchema), asyncHandler(async (req, res) => {
  const group = await Group.findOne({ inviteCode: req.body.inviteCode.toUpperCase() });
  if (!group) throw new AppError('Invalid invite code', 404);
  if (!group.members.some(({ user }) => user.toString() === req.user._id.toString())) {
    group.members.push({ user: req.user._id, role: 'member' });
    await group.save();
  }
  res.json({ group: await populated(group) });
}));

router.get('/:id', validate(idParams, 'params'), asyncHandler(async (req, res) => {
  const group = await getMemberGroup(req.params.id, req.user._id);
  res.json({ group: await populated(group) });
}));

router.patch('/:id', validate(idParams, 'params'), validate(updateSchema), asyncHandler(async (req, res) => {
  const group = await getMemberGroup(req.params.id, req.user._id);
  if (!isOwner(group, req.user._id)) throw new AppError('Only the group owner can update it', 403);
  Object.assign(group, req.body);
  await group.save();
  res.json({ group: await populated(group) });
}));

router.delete('/:id', validate(idParams, 'params'), asyncHandler(async (req, res) => {
  const group = await getMemberGroup(req.params.id, req.user._id);
  if (!isOwner(group, req.user._id)) throw new AppError('Only the group owner can delete it', 403);
  await Promise.all([
    Group.deleteOne({ _id: group._id }),
    Expense.deleteMany({ group: group._id }),
    Settlement.deleteMany({ group: group._id })
  ]);
  res.status(204).send();
}));

router.get('/:groupId/balances', validate(groupIdParams, 'params'), asyncHandler(async (req, res) => {
  const group = await getMemberGroup(req.params.groupId, req.user._id);
  const balances = await calculateBalances(group);
  res.json({ balances: group.members.map(({ user }) => ({
    user: user.toString(), balance: balances[user.toString()] || 0
  })) });
}));

router.get('/:groupId/settlements/simplified', validate(groupIdParams, 'params'), asyncHandler(async (req, res) => {
  const group = await getMemberGroup(req.params.groupId, req.user._id);
  const balances = await calculateBalances(group);
  const ids = new Set(group.members.map(({ user }) => user.toString()));
  const settlements = simplifyBalances(balances).map((item) => ({
    ...item,
    from: ids.has(item.from) ? item.from : null,
    to: ids.has(item.to) ? item.to : null
  }));
  res.json({ settlements: settlements.filter((item) => item.from && item.to) });
}));

export default router;
