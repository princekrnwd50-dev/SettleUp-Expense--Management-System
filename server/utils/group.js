import { Group } from '../models/Group.js';
import { AppError } from '../middleware/error.js';

export async function getMemberGroup(groupId, userId) {
  const group = await Group.findOne({ _id: groupId, 'members.user': userId });
  if (!group) throw new AppError('Group not found', 404);
  return group;
}

export function memberIds(group) {
  return group.members.map((member) => member.user.toString());
}

export function isOwner(group, userId) {
  return group.owner.toString() === userId.toString();
}
