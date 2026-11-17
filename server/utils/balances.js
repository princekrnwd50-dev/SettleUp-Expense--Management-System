import { Expense } from '../models/Expense.js';
import { Settlement } from '../models/Settlement.js';

const cents = (value) => Math.round(value * 100);

export async function calculateBalances(group) {
  const [expenses, paidSettlements] = await Promise.all([
    Expense.find({ group: group._id }).lean(),
    Settlement.find({ group: group._id, status: 'paid' }).lean()
  ]);
  const balances = Object.fromEntries(group.members.map(({ user }) => [user.toString(), 0]));

  for (const expense of expenses) {
    const payer = expense.paidBy.toString();
    if (balances[payer] !== undefined) balances[payer] += cents(expense.amount);
    for (const split of expense.splits) {
      const participant = split.user.toString();
      if (balances[participant] !== undefined) balances[participant] -= cents(split.amount);
    }
  }
  for (const settlement of paidSettlements) {
    const from = settlement.from.toString();
    const to = settlement.to.toString();
    if (balances[from] !== undefined) balances[from] += cents(settlement.amount);
    if (balances[to] !== undefined) balances[to] -= cents(settlement.amount);
  }
  return Object.fromEntries(Object.entries(balances).map(([id, value]) => [id, value / 100]));
}

export function simplifyBalances(balances) {
  const creditors = Object.entries(balances).map(([id, amount]) => ({ id, cents: Math.max(0, Math.round(amount * 100)) }))
    .filter(({ cents }) => cents > 0).sort((a, b) => b.cents - a.cents);
  const debtors = Object.entries(balances).map(([id, amount]) => ({ id, cents: Math.max(0, Math.round(-amount * 100)) }))
    .filter(({ cents }) => cents > 0).sort((a, b) => b.cents - a.cents);
  const result = [];
  let debtor = 0;
  let creditor = 0;
  while (debtor < debtors.length && creditor < creditors.length) {
    const amount = Math.min(debtors[debtor].cents, creditors[creditor].cents);
    result.push({ from: debtors[debtor].id, to: creditors[creditor].id, amount: amount / 100 });
    debtors[debtor].cents -= amount;
    creditors[creditor].cents -= amount;
    if (debtors[debtor].cents === 0) debtor += 1;
    if (creditors[creditor].cents === 0) creditor += 1;
  }
  return result;
}
