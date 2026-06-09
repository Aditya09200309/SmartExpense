const BASE_URL = 'http://localhost:3000/api';

async function run() {
  try {
    const password = 'password123';
    
    // 1. Register 3 users
    const users = await Promise.all([
      fetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice Insight', email: `alice_${Date.now()}@test.com`, password })
      }).then(r => r.json()).then(d => d.user),
      fetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bob Insight', email: `bob_${Date.now()}@test.com`, password })
      }).then(r => r.json()).then(d => d.user),
      fetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Charlie Insight', email: `charlie_${Date.now()}@test.com`, password })
      }).then(r => r.json()).then(d => d.user)
    ]);

    const [alice, bob, charlie] = users;
    console.log('Users created:', alice.id, bob.id, charlie.id);

    // 2. Login Alice to get token
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: alice.email, password })
    });
    const { token } = await loginRes.json();
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 3. Create Group
    const groupRes = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Insight Test Group', description: 'Testing balance insight' })
    }).then(r => r.json());
    
    const group = groupRes.group || groupRes;
    console.log('Group created:', group.id);

    // 4. Add Members
    const m1 = await fetch(`${BASE_URL}/groups/${group.id}/members`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ userId: bob.id })
    }).then(r => r.json());
    if (m1.error) throw new Error(m1.error);

    const m2 = await fetch(`${BASE_URL}/groups/${group.id}/members`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ userId: charlie.id })
    }).then(r => r.json());
    if (m2.error) throw new Error(m2.error);
    
    console.log('Members added');

    // 5. Create 5 Expenses where Alice pays for everyone to satisfy the "Confidence Check" (totalInitiation >= 5)
    for (let i = 0; i < 5; i++) {
      const expenseRes = await fetch(`${BASE_URL}/expenses`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          groupId: group.id,
          paidById: alice.id,
          amount: 90,
          description: `Dinner ${i+1}`,
          splits: [
            { userId: alice.id, amount: 30 },
            { userId: bob.id, amount: 30 },
            { userId: charlie.id, amount: 30 }
          ]
        })
      });
      if (!expenseRes.ok) {
        throw new Error(`Expense ${i+1} failed: ${await expenseRes.text()}`);
      }
    }
    console.log('5 Expenses created successfully (totalInitiation = 5).');

    // Wait a bit for async side-effect (updateGroupSocialEquilibrium) to finish processing
    await new Promise(r => setTimeout(r, 1000));

    // 6. Test Social Balance Insight
    console.log('\n--- Fetching Balance Insight ---');
    const insightRes = await fetch(`${BASE_URL}/intelligence/groups/${group.id}/balance-insight`, {
      headers: authHeaders
    });
    
    if (!insightRes.ok) {
      console.error('Failed to fetch balance insight:', insightRes.status, await insightRes.text());
    } else {
      const insight = await insightRes.json();
      console.log('Insight Data:', JSON.stringify(insight, null, 2));
      
      if (insight.message.includes('Alice Insight')) {
        console.log('SUCCESS: Insight logic is working as expected!');
      } else {
        console.log('FAILURE: Expected insight message mentioning Alice Insight, but got:', insight.message);
      }
    }
  } catch (err) {
    console.error('Test failed:', err);
  }
}

run();
