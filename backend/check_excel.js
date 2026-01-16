import xlsx from 'xlsx';
const wb = xlsx.readFile('../frontend/Excel/Dbvoximon.xlsx');
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const data = xlsx.utils.sheet_to_json(ws);
  console.log(`Sheet ${name}: ${data.length} rows`);
  if (data.length > 0) {
    console.log('Headers:', Object.keys(data[0]));
    console.log('First row:', data[0]);
  }
});