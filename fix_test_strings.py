import re

with open('tests/medicine-intelligence.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the test strings to use proper newline escapes
# Replace actual newlines within parseMedicineLabel calls with \\n

# Find the parseMedicineLabel calls
def fix_string(match):
    s = match.group(1)
    # Replace actual newline with \n escape
    s = s.replace('\n', '\\n')
    return f"parseMedicineLabel('{s}')"

# Match parseMedicineLabel('...') where ... might contain newlines
pattern = re.compile(r"parseMedicineLabel\('((?:[^'\\n]|\\n)*)'\)")
content = pattern.sub(fix_string, content)

with open('tests/medicine-intelligence.test.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed test strings')
