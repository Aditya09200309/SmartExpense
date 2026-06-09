const http = require('http');

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const BASE_URL = 'http://localhost:3000/api';

async function run() {
  const aliceEmail = `alice_${Date.now()}@test.com`;
  const bobEmail = `bob_${Date.now()}@test.com`;
  const charlieEmail = `charlie_${Date.now()}@test.com`;
  const password = 'password123';

  // 1. Register users
  const aRes = await request(`${BASE_URL}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { name: 'Alice', email: aliceEmail, password });
  const bRes = await request(`${BASE_URL}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { name: 'Bob', email: bobEmail, password });
  const cRes = await request(`${BASE_URL}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { name: 'Charlie', email: charlieEmail, password });

  const bobId = bRes.user.id;
  const charlieId = cRes.user.id;

  // 2. Login as Alice to get token
  const loginRes = await request(`${BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, { email: aliceEmail, password });
  const token = loginRes.token;
  const aliceId = loginRes.user.id;
  console.log('Alice logged in. ID:', aliceId);

  const authHeader = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 3. Create Group
  const groupRes = await request(`${BASE_URL}/groups`, { method: 'POST', headers: authHeader }, { name: '3-Person Group', description: 'test' });
  const groupId = groupRes.group.id;
  console.log('Group created:', groupId);

  // 4. Add Members
  await request(`${BASE_URL}/groups/${groupId}/members`, { method: 'POST', headers: authHeader }, { userId: bobId });
  await request(`${BASE_URL}/groups/${groupId}/members`, { method: 'POST', headers: authHeader }, { userId: charlieId });
  console.log('Members added:', bobId, charlieId);

  // 5. Create Expense (Alice pays 90, split 30 each)
  await request(`${BASE_URL}/expenses`, { method: 'POST', headers: authHeader }, {
    groupId,
    paidById: aliceId,
    amount: 90,
    description: 'Dinner',
    splits: [
      { userId: aliceId, amount: 30 },
      { userId: bobId, amount: 30 },
      { userId: charlieId, amount: 30 }
    ]
  });
  console.log('Expense created');

  // 6. Check Balances
  const balanceRes = await request(`${BASE_URL}/groups/${groupId}/balances`, { headers: authHeader });
  console.log('API Balances Response:', JSON.stringify(balanceRes, null, 2));

  // 7. Verify Simplified Debts
  const debts = balanceRes.simplifiedDebts;
  if (debts.length === 2) {
    console.log('SUCCESS: API returns 2 debts.');
  } else {
    console.log(`FAILURE: API returns ${debts.length} debts.`);
  }
}

run().catch(console.error);
