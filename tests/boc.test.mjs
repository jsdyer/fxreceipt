import test from 'node:test';
import assert from 'node:assert/strict';
import {historyURL,observations,seriesFor} from '../web/boc.mjs';

test('use common observation date and invert CAD/INR for weekend comparisons', () => {
  const daily = observations({observations:[
    {d:'2026-01-02', FXINRCAD:{v:'0.02'}, FXUSDCAD:{v:'1.40'}},
    {d:'2026-01-05', FXINRCAD:{v:'0.017'}, FXUSDCAD:{v:'1.39'}}
  ]});
  assert.deepEqual(seriesFor(daily,'CAD','INR','2026-01-04'),[{date:'2026-01-02',rate:50}]);
  assert.equal(seriesFor(daily,'USD','CAD','2026-01-04')[0].rate,1.4);
  assert.throws(() => seriesFor(daily,'CAD','INR','2010-01-01'));
  assert.throws(() => historyURL('2026-02-30'));
  assert.equal(new URL(historyURL('2026-11-25')).searchParams.get('end_date'),'2026-11-25');
});
