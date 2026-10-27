with open('tests/medicine-intelligence.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix: the first interaction test - already has correct content
# Fix: the second interaction test that was missing its opening
old = """  assert.equal(interactions.state, 'checked');
  assert.equal(interactions.ui_state, 'checked_no_pairs_found');
});"""

new = """test('a verified interaction source is used, and invalid findings are dropped', () => {
  const interactions = checkInteractions([], { name: 'Lonart DS', source: 'RxNorm' });
  assert.equal(interactions.state, 'checked');
  assert.equal(interactions.ui_state, 'checked_no_pairs_found');
});"""

content = content.replace(old, new)

with open('tests/medicine-intelligence.test.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed interaction tests')
