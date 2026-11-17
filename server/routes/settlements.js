import { Router } from 'express';
import { z } from 'zod';

import { Group } from '../models/Group.js';
import { Settlement } from '../models/Settlement.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getMemberGroup } from '../utils/group.js';

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');
const fields = z.object({
  groupId: objectId,
  from: objectId,
  to: objectId,
  amount: z.coerce.number().finite().positive(),
  method: z.enum(['Cash', 'UPI', 'Bank Transfer', 'Other']).optional().default('Other'),
  paymentDate: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional().default('')
});
const idParams = z.object({ id: objectId });
const querySchema = z.object({ groupId: objectId.optional(), status: z.enum(['pending', 'paid']).optional() });

function populated(query) {
  return query.populate([
    { path: 'from', select: 'name email avatar' },
    { path: 'to', select: 'name email avatar' }
  ]);
}

async function markPaid(req, res, next) {
  try {
    const settlement = await Settlement.findById(req.params.id);
    if (!settlement) throw new AppError('Settlement not found', 404);
    const group = await getMemberGroup(settlement.group, req.user._id);
    const canMarkPaid = [settlement.from.toString(), settlement.to.toString(), group.owner.toString()]
      .includes(req.user._id.toString());
    if (!canMarkPaid) throw new AppError('Only the payer, recipient, or group owner can mark this paid', 403);
    settlement.status = 'paid';
    settlement.paidAt = new Date();
    await settlement.save();
    res.json({ settlement: await populated(settlement) });
  } catch (error) {
    next(error);
  }
}

router.use(requireAuth);

router.get('/', validate(querySchema, 'query'), asyncHandler(async (req, res) => {
  const groups = await Group.find({ 'members.user': req.user._id, ...(req.query.groupId ? { _id: req.query.groupId } : {}) }).select('_id');
  const groupIds = groups.map((group) => group._id);
  const settlements = await populated(Settlement.find({
    group: { $in: groupIds },
    ...(req.query.status ? { status: req.query.status } : {})
  }).sort({ createdAt: -1 }));
  res.json({ settlements });
}));

router.post('/', validate(fields), asyncHandler(async (req, res) => {
  const group = await getMemberGroup(req.body.groupId, req.user._id);
  const members = new Set(group.members.map(({ user }) => user.toString()));
  if (req.body.from === req.body.to || !members.has(req.body.from) || !members.has(req.body.to)) {
    throw new AppError('Settlement participants must be distinct group members', 400);
  }
  const settlement = await Settlement.create({ ...req.body, group: req.body.groupId });
  res.status(201).json({ settlement: await populated(settlement) });
}));

router.patch('/:id/paid', validate(idParams, 'params'), markPaid);
router.post('/:id/paid', validate(idParams, 'params'), markPaid);

export default router;
