import { useEffect, useState } from 'react';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

function today() {
  const parts = formatter.formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

export function JianweiDate() {
  const [date, setDate] = useState(today);
  useEffect(() => {
    const refresh = () => setDate(today());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const [year, month, day] = date.split('-');
  return <time className="jw-section-date" dateTime={date}
    aria-label={`今日日期 ${year}年${Number(month)}月${Number(day)}日`}>
    {`${year} / ${month} / ${day}`}
  </time>;
}
