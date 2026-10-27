with open('tests/medicine-intelligence.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the old Mock localStorage section (lines 2-14)
old1 = """// Mock localStorage for Node.js test environment
const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => { mockStorage[key] = value; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
    key: (index: number) => Object.keys(mockStorage)[index] ?? null,
    length: Object.keys(mockStorage).length,
  },
  writable: true,
  configurable: true,
});

"""

content = content.replace(old1, '')

# Remove the second mockStorage section (lines 39-44)
old2 = """// Mock localStorage for Node.js test environment
const mockStorage: Record<string, string> = {};
const originalGetItem = localStorage.getItem.bind(localStorage);
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = (key: string, value: string) => { mockStorage[key] = value; };
localStorage.getItem = (key: string) => { return mockStorage[key] ?? null; };

"""
content = content.replace(old2, '')

with open('tests/medicine-intelligence.test.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Removed duplicate mockStorage')
