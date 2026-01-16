(function(){
  const PERIOD_LEN_MIN = 50;
  const PERIOD_STARTS = [
    "06:00","07:00","08:00","09:00","10:00",
    "11:00","12:00","13:00","14:00","15:00",
    "16:00","17:00","18:00","19:00","20:00"
  ];

  function toMinutes(hm){ if(!hm) return null; const [hh,mm]=hm.split(":").map(Number); if(Number.isNaN(hh) || Number.isNaN(mm)) return null; return hh*60+mm; }
  function addMinutes(hm, mins){ const [h,m]=hm.split(":").map(Number); const d=new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes()+mins); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  function overlaps(aStart,aEnd,bStart,bEnd){ return !( toMinutes(aEnd) <= toMinutes(bStart) || toMinutes(bEnd) <= toMinutes(aStart) ); }

  const LAST_END = addMinutes(PERIOD_STARTS[PERIOD_STARTS.length-1], PERIOD_LEN_MIN);


  const scheduleDb = {};
  PERIOD_STARTS.forEach(ps => {
    scheduleDb[ps] = {
      'mon': [],
      'tue': [],
      'wed': [],
      'thu': [],
      'fri': []
    };
  });

  window.SCHEDULE_CONFIG = {
    PERIOD_LEN_MIN,
    PERIOD_STARTS,
    LAST_END,
    toMinutes,
    addMinutes,
    overlaps,
    scheduleDb
  };
})();
