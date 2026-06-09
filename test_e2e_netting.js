const BASE_URL = 'http://localhost:3000/api';

async function request(url, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${url}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request to ${url} failed with status ${res.status}: ${text}`);
  }
  return res.json();
}

async function run() {
  console.log('=== STARTING CROSS-GROUP NETTING (SMART NETTING) E2E TESTS ===');

  const ts = Date.now();
  const aliceEmail = `alice_net_${ts}@test.com`;
  const bobEmail = `bob_net_${ts}@test.com`;
  const password = 'password123';

  // 1. Register Alice and Bob
  console.log('1. Registering Alice and Bob...');
  const aliceReg = await request('/users', 'POST', { name: 'Alice', email: aliceEmail, password });
  const bobReg = await request('/users', 'POST', { name: 'Bob', email: bobEmail, password });

  // 2. Login to get tokens
  console.log('2. Logging in...');
  const aliceLogin = await request('/auth/login', 'POST', { email: aliceEmail, password });
  const bobLogin = await request('/auth/login', 'POST', { email: bobEmail, password });

  const aliceToken = aliceLogin.token;
  const bobToken = bobLogin.token;

  // 3. Create Group 1 (EUR base)
  console.log('3. Creating Group 1: Trip to Paris (EUR base)...');
  const group1Res = await request('/groups', 'POST', {
    name: 'Trip to Paris',
    description: 'Euro trip',
    baseCurrency: 'EUR'
  }, aliceToken);
  const group1 = group1Res.group;
  await request(`/groups/${group1.id}/members`, 'POST', { userId: bobLogin.user.id }, aliceToken);

  // 4. Create Group 2 (USD base)
  console.log('4. Creating Group 2: Home Rent (USD base)...');
  const group2Res = await request('/groups', 'POST', {
    name: 'Home Rent',
    description: 'Shared flat',
    baseCurrency: 'USD'
  }, aliceToken);
  const group2 = group2Res.group;
  await request(`/groups/${group2.id}/members`, 'POST', { userId: bobLogin.user.id }, aliceToken);

  // 5. Add expense in Group 1 paid by Alice: 90 EUR (Bob owes Alice 45 EUR)
  console.log('5. Adding Group 1 expense: 90 EUR paid by Alice...');
  await request('/expenses', 'POST', {
    groupId: group1.id,
    paidById: aliceLogin.user.id,
    amount: 90,
    description: 'Hotel booking',
    currency: 'EUR',
    exchangeRate: 1.0,
    splits: [
      { userId: aliceLogin.user.id, amount: 45 },
      { userId: bobLogin.user.id, amount: 45 }
    ]
  }, aliceToken);

  // 6. Add expense in Group 2 paid by Bob: 60 USD (Alice owes Bob 30 USD)
  console.log('6. Adding Group 2 expense: 60 USD paid by Bob...');
  await request('/expenses', 'POST', {
    groupId: group2.id,
    paidById: bobLogin.user.id,
    amount: 60,
    description: 'Kitchen appliances',
    currency: 'USD',
    exchangeRate: 1.0,
    splits: [
      { userId: aliceLogin.user.id, amount: 30 },
      { userId: bobLogin.user.id, amount: 30 }
    ]
  }, bobToken);

  // 7. Retrieve Alice's Global Netted Balances
  console.log("7. Retrieving Alice's Global Netted Balances (targetCurrency = EUR)...");
  const globalBalances = await request('/groups/global?currency=EUR', 'GET', null, aliceToken);
  console.log('Global Netted Balances:', JSON.stringify(globalBalances, null, 2));

  expect(globalBalances.length, 1);
  const bobNet = globalBalances[0];
  expect(bobNet.userId, bobLogin.user.id);
  expect(bobNet.currency, 'EUR');

  // Let's assert the math details:
  // Alice owes Bob 30 USD in Group 2. Let's convert this to EUR using the exchange rate factor.
  // Group 1: Bob owes Alice 45 EUR (+45 EUR in Alice's favor).
  // Group 2: Alice owes Bob 30 USD. The API converts 30 USD to EUR.
  // The net Amount is: 45 EUR - (30 USD * USD_to_EUR_factor).
  console.log(`Bob's net debt to Alice: ${bobNet.netAmount} EUR`);
  expect(bobNet.netAmount > 0, true); // Bob owes Alice overall

  // 8. Settle the Global Netted Balance transactionally!
  console.log('8. Recording transactional Global Settle Up...');
  // Since Bob owes Alice overall, Bob pays Alice the net amount to settle both groups.
  const settlementPayload = {
    receiverId: aliceLogin.user.id,
    amount: bobNet.netAmount,
    targetCurrency: 'EUR',
    breakdown: bobNet.breakdown.map(item => ({
      groupId: item.groupId,
      originalAmount: item.originalAmount,
      payerId: item.originalAmount < 0 ? aliceLogin.user.id : bobLogin.user.id,
      receiverId: item.originalAmount < 0 ? bobLogin.user.id : aliceLogin.user.id,
      amount: Math.abs(item.originalAmount)
    }))
  };

  const settleRes = await request('/settlements/global', 'POST', settlementPayload, bobToken);
  console.log('Global Settlement Response:', JSON.stringify(settleRes, null, 2));
  expect(settleRes.settlements.length, 2);

  // 9. Re-fetch Global netted balances to ensure everything is fully optimized!
  console.log('9. Re-verifying global net balances...');
  const updatedNetted = await request('/groups/global?currency=EUR', 'GET', null, aliceToken);
  console.log('Updated Net Balances:', JSON.stringify(updatedNetted, null, 2));
  expect(updatedNetted.length, 0);

  console.log('=== ALL CROSS-GROUP NETTING E2E TESTS PASSED SUCCESSFULLY! 100% CORRECTNESS! ===');
}

function expect(actual, expected) {
  if (typeof expected === 'function') {
    if (!expected(actual)) {
      throw new Error(`Assertion failed: condition not met for value ${actual}`);
    }
  } else if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}`);
  }
}

run().catch(err => {
  console.error('TEST FAIL:', err);
  process.exit(1);
});
