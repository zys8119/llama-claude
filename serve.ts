const seen = new Set();
const data = [1, 2, 3, 2, 4, 5, 3];

for (const item of data) {
  if (!seen.has(item)) {
    seen.add(item);
    console.log(`Added ${item}`);
  }
}
