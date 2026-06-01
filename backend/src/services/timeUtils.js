const MEXICO_OFFSET = 360; // UTC-6 en minutos

export function toMexicoTime(date = new Date()) {
  const serverOffset = date.getTimezoneOffset();
  const diffMin = MEXICO_OFFSET - serverOffset;
  return new Date(date.getTime() + diffMin * 60000);
}

export function hoyMX() {
  const m = toMexicoTime();
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}

export function horaMX() {
  const m = toMexicoTime();
  return `${String(m.getHours()).padStart(2, '0')}:${String(m.getMinutes()).padStart(2, '0')}:00`;
}

export function diaMX() {
  const m = toMexicoTime();
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  return dias[m.getDay()];
}

export function getBloqueActual() {
  const m = toMexicoTime();
  const totalMin = m.getHours() * 60 + m.getMinutes();
  const bloques = [
    [1,'07:00','07:50'],[2,'07:50','08:40'],[3,'08:40','09:30'],[4,'09:30','10:20'],
    [5,'10:20','10:30'],[6,'10:30','11:20'],[7,'11:20','12:10'],[8,'12:10','13:00'],
    [9,'13:00','13:50'],[10,'14:00','14:50'],[11,'14:50','15:40'],[12,'15:40','16:30'],
    [13,'16:30','17:20'],[14,'17:20','18:10'],[15,'18:10','19:00'],[16,'19:00','19:50'],
    [17,'19:50','20:40'],[18,'20:40','20:50']
  ];
  for (const b of bloques) {
    const [hI, mI] = b[1].split(':').map(Number);
    const [hF, mF] = b[2].split(':').map(Number);
    if (totalMin >= hI * 60 + mI && totalMin < hF * 60 + mF) return b[0];
  }
  return null;
}
