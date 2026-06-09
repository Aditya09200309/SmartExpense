import { simplifyDebts } from './src/modules/balance/balance.service';

const userMap = new Map([
  ['user1', { id: 'user1', name: 'User 1', email: 'user1@test.com' }],
  ['user2', { id: 'user2', name: 'User 2', email: 'user2@test.com' }],
  ['user3', { id: 'user3', name: 'User 3', email: 'user3@test.com' }],
]);

const balanceCents = new Map([
  ['user1', 6000],   // owed 60
  ['user2', -3000],  // owes 30
  ['user3', -3000],  // owes 30
]);

const debts = simplifyDebts(balanceCents, userMap);
console.log(debts);
