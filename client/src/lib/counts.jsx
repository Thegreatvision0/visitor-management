/* The headline numbers, defined once. Dashboard, Reception and Accommodation all use this module,
   so the same question always gets the same answer on every screen. */
import { today } from '@shared/dates.js';
import { stayStart, stayEnd } from '@shared/constants.js';

/** Plain-language definition of each count (shown as an ⓘ tooltip). */
export const COUNT_HELP = {
  residing: 'Currently residing: sewadar who have checked in and not yet checked out.',
  expected: 'Expected arrivals: approved requests whose stay starts today or has already started (late), and who have not arrived yet.',
  upcoming: 'Upcoming arrivals: approved requests whose stay starts after today.',
  dueToday: 'Due today: residents whose approved stay ends today.',
  overdue: 'Overdue: residents whose approved stay ended before today and who have not checked out.',
  occupied: 'Occupied beds: beds held by someone who has checked in (or a guest who has arrived). Beds waiting for cleaning are counted under Cleaning.',
  reserved: 'Reserved beds: beds booked for someone approved who has not arrived yet.',
  cleaning: 'Cleaning: beds released at check-out and not yet marked clean.',
  available: 'Available beds: free, clean and not booked.'
};

/** All headline counts (as record lists, so a screen can show the same records it counts). */
export function counts(D, t = today()) {
  const R = D.regs(), res = R.filter(r => r.status === 'Checked In'), appr = R.filter(r => r.status === 'Approved');
  const beds = { Available: 0, Occupied: 0, Reserved: 0, Cleaning: 0, total: D.data.beds.length };
  D.bedStates().forEach(s => { beds[s.status]++; });
  return {
    residing: res,
    expected: appr.filter(r => stayStart(r) <= t), late: appr.filter(r => stayStart(r) < t), upcoming: appr.filter(r => stayStart(r) > t),
    dueToday: res.filter(r => stayEnd(r) === t), overdue: res.filter(r => stayEnd(r) < t),
    arrivedToday: R.filter(r => r.actualIn && r.actualIn.slice(0, 10) === t), departedToday: R.filter(r => r.status === 'Checked Out' && r.actualOut && r.actualOut.slice(0, 10) === t),
    beds
  };
}

/** Small ⓘ marker; the definition is in the tooltip and read out by screen readers. */
export const Help = ({ k, text }) => <span className="help" role="img" title={text || COUNT_HELP[k]} aria-label={text || COUNT_HELP[k]}>ⓘ</span>;
