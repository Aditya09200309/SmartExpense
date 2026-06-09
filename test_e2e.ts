const BASE_URL = 'http://localhost:3000/api';

async function run() {
  // 1. Register 3 users
  const users = await Promise.all([
    fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', email: `alice_${Date.now()}@test.com` })
    }).then((r: any) => r.json()),
    fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: `bob_${Date.now()}@test.com` })
    }).then((r: any) => r.json()),
    fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Charlie', email: `charlie_${Date.now()}@test.com` })
    }).then((r: any) => r.json())
  ]);

  const [alice, bob, charlie] = users;
  console.log('Users created:', alice.id, bob.id, charlie.id);

  // 2. Create Group
  const group = await fetch(`${BASE_URL}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-id': alice.id },
    body: JSON.stringify({ name: 'Test Group', description: 'test' })
  }).then((r: any) => r.json());
  console.log('Group created:', group.id);

  // 3. Add Members
  await fetch(`${BASE_URL}/groups/${group.id}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-id': alice.id },
    body: JSON.stringify({ email: bob.email })
  });
  await fetch(`${BASE_URL}/groups/${group.id}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-id': alice.id },
    body: JSON.stringify({ email: charlie.email })
  });

  // 4. Create Expense
  const expenseRes = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-id': alice.id },
    body: JSON.stringify({
      groupId: group.id,
      paidById: alice.id,
      amount: 90,
      description: 'Dinner',
      splits: [
        { userId: alice.id, amount: 30 },
        { userId: bob.id, amount: 30 },
        { userId: charlie.id, amount: 30 }
      ]
    })
  });
  console.log('Expense created:', await expenseRes.json());

  // 5. Check Balances
  const balanceRes = await fetch(`${BASE_URL}/groups/${group.id}/balances`, {
    headers: { 'user-id': alice.id }
  });
  const balances = await balanceRes.json();
  console.log('Balances:', JSON.stringify(balances, null, 2));
}

run().catch(console.error);
