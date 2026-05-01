import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const form = new FormData();
form.append('excel', fs.createReadStream('../frontend/Excel/Dbvoximon.xlsx'));

fetch('http://localhost:3000/api/data/import/horarios', {
  method: 'POST',
  body: form
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));