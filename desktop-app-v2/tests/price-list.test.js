// The price list's smart paste (no AI) and its safe shape. Run with: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const PL = require('../public/price-list');

const items = list => list.sections.flatMap(s => s.items.map(i => [s.title, i.service, i.price, i.time]));

test('sections from headings, with leaders, dashes and times', () => {
  const list = PL.parse(`HAIR
Ladies cut & finish ........ £35 · 45 mins
Gents cut - £18 - 30 min
Blow dry £22

Nails:
Gel polish   £25   1 hr
Full set acrylics £40 1h 30m`);
  assert.deepStrictEqual(items(list), [
    ['HAIR', 'Ladies cut & finish', '£35', '45 mins'],
    ['HAIR', 'Gents cut', '£18', '30 min'],
    ['HAIR', 'Blow dry', '£22', ''],
    ['Nails', 'Gel polish', '£25', '1 hr'],
    ['Nails', 'Full set acrylics', '£40', '1h 30m']
  ]);
});

test('a heading is a plain line followed by priced lines', () => {
  const list = PL.parse('Facials\nExpress facial £30\nDeluxe facial from £55\nMassage\nBack massage £28');
  assert.deepStrictEqual(list.sections.map(s => s.title), ['Facials', 'Massage']);
  assert.strictEqual(list.sections[0].items[1].price, 'from £55');
});

test('spreadsheet / table rows, header row skipped', () => {
  const list = PL.parse('Service\tPrice\tTime\nMOT\t£54.85\t45 mins\nFull service\t£189\t3 hours');
  assert.deepStrictEqual(items(list), [['', 'MOT', '£54.85', '45 mins'], ['', 'Full service', '£189', '3 hours']]);
  const piped = PL.parse('| Brakes | £120 |\n| Tyres | from £60 |');
  assert.deepStrictEqual(items(piped), [['', 'Brakes', '£120', ''], ['', 'Tyres', 'from £60', '']]);
});

test('price on the line after the service', () => {
  const list = PL.parse('Consultation\nFree\nCut and colour\n£65\n2 hours');
  assert.deepStrictEqual(items(list), [['', 'Consultation', 'Free', ''], ['', 'Cut and colour', '£65', '2 hours']]);
});

test('bare numbers, bullets, ranges and POA', () => {
  const list = PL.parse('• Gel nails 25\n- Extensions £80-£120\n1. Bridal package POA');
  assert.deepStrictEqual(items(list), [['', 'Gel nails', '25', ''], ['', 'Extensions', '£80-£120', ''], ['', 'Bridal package', 'POA', '']]);
});

test('clean() keeps only the safe shape', () => {
  assert.deepStrictEqual(PL.clean(null), { sections: [] });
  assert.deepStrictEqual(PL.clean({ sections: [{ name: 'A', items: [{ name: 'x', price: 5, duration: '1h' }, {}] }, { items: [] }] }),
    { sections: [{ title: 'A', items: [{ service: 'x', price: '5', time: '1h' }] }] });
  assert.strictEqual(PL.summary({ sections: [{ title: 'A', items: [{ service: 'x' }] }, { title: 'B', items: [{ service: 'y' }] }] }), '2 services in 2 sections');
});

test('toText() pastes back into the same list', () => {
  const list = PL.parse('Hair:\nCut £20 30 mins\nNails:\nGel £25');
  assert.deepStrictEqual(PL.parse(PL.toText(list)), list);
});
