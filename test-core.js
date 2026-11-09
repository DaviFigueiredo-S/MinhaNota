'use strict';
const assert = require('node:assert/strict');
const core = require('./calculator-core.js');
const { MODES, weightsFor, calculateAverageForMode, customRound, buildP2OutcomeScenarios,
  prepareProjectionGrades, firstHalfPointAtOrAbove, buildHalfPointScenarios, minimumP2, p2Projection } = core;
const approx = (a, b) => assert.ok(Math.abs(a - b) <= 1e-9, `Esperado ${b}; recebido ${a}`);

// Fórmula original: média de P1/P2 peso total 80% + P.I/ATV 20%.
approx(calculateAverageForMode({P1:3,P2:5,PI:10,ATV:6.4}, MODES.PI), 4.84);
approx(calculateAverageForMode({P1:4.8,P2:3,PI:10,ATV:6.3}, MODES.PI), 4.75);
for (const [raw,rounded] of [[4.24,4],[4.25,4.5],[4.74,4.5],[4.75,5],[5.25,5.5],[6.74,6.5],[6.75,7],[8.99,9]]) {
  assert.equal(customRound(raw), rounded);
}
for (const mode of Object.values(MODES)) approx(Object.values(weightsFor(mode)).reduce((s,w)=>s+w,0),1);
assert.deepEqual(weightsFor(MODES.PI),{P1:.4,P2:.4,PI:.1,ATV:.1});
assert.deepEqual(weightsFor(MODES.PRESENTATION),{P1:.4,P2:.4,ATV:.2});
assert.deepEqual(weightsFor(MODES.NONE),{P1:.4,P2:.4,ATV:.2});

// P.I não afeta modalidades sem integrada; bônus limitado a 10 e não cumulativo.
const values = {P1:5,P2:9.8,PI:1,ATV:8};
approx(calculateAverageForMode(values,MODES.PRESENTATION), 5*.4+10*.4+8*.2);
approx(calculateAverageForMode({...values,PI:10},MODES.NONE),calculateAverageForMode({...values,PI:0},MODES.NONE));
assert.equal(core.effectiveGrades(values,MODES.PRESENTATION).P2,10);
assert.equal(calculateAverageForMode({P1:0,P2:0,PI:0,ATV:0},MODES.NONE),0);
assert.equal(core.parseGrade(''),null);
assert.equal(core.parseGrade('10,1'),null);
assert.equal(core.parseGrade('0'),0);
assert.equal(core.parseGrade('3,4'),3.4);

// Escala fixada de 0 até 10 e último cenário incluído.
for (const [input,expected] of [[3,3],[3.4,3.5],[2.2,2.5],[6.7,7],[9.8,10],[10,10],[0,0]]) {
  assert.equal(firstHalfPointAtOrAbove(input),expected);
}
assert.deepEqual(buildHalfPointScenarios(0),Array.from({length:21},(_,i)=>i/2));
const grades = {P1:3,P2:null,PI:10,ATV:6.4};
const projected = prepareProjectionGrades(grades,MODES.PI,'P2');
assert.equal(projected.P2,null);
assert.equal(grades.P2,null);
const r=buildP2OutcomeScenarios(grades,MODES.PI);
assert.equal(r.rows.length,21);
assert.equal(r.firstApproval,5);
assert.equal(r.counts.approved,11);
assert.equal(r.counts.failed,10);
assert.equal(r.counts.undetermined,0);
approx(r.rows.find(x=>x.p2===5).raw,4.84);
assert.equal(r.rows.find(x=>x.p2===4.5).status,'failed');
assert.equal(r.rows.find(x=>x.p2===5).status,'approved');
for (const row of r.rows) assert.ok(row.p2>=0 && row.p2<=10 && row.p2*2===Math.round(row.p2*2));

// ATV vazia: 0 só na projeção. A nota oficial permanece ausente.
const noAtv={P1:6,P2:null,PI:10,ATV:null};
const rNoAtv=buildP2OutcomeScenarios(noAtv,MODES.PI);
assert.equal(rNoAtv.assumedATV,true);
assert.equal(noAtv.ATV,null);
approx(rNoAtv.rows[0].raw,3.4);
assert.equal(rNoAtv.firstApproval,3.5);

// Se a P.I está em branco: faixas de médias e status indeterminados.
const unknown=buildP2OutcomeScenarios({P1:3,P2:null,PI:null,ATV:null},MODES.PI);
assert.equal(unknown.missingPI,true);
assert.ok(unknown.rows.some(x=>x.status==='undetermined'));
assert.equal(unknown.rows[0].raw,null);
assert.ok(unknown.rows.every(x=>x.minRaw<=x.maxRaw));
assert.equal(Object.values(unknown.counts).reduce((a,b)=>a+b,0),21);
for (const mode of [MODES.NONE,MODES.PRESENTATION]) {
 const result=buildP2OutcomeScenarios({P1:5,P2:null,PI:null,ATV:10},mode);
 assert.equal(result.missingPI,false);
 assert.equal(result.counts.undetermined,0);
 assert.equal(result.rows.length,21);
}
const bonus=buildP2OutcomeScenarios({P1:5,P2:null,PI:10,ATV:8},MODES.PRESENTATION).rows;
assert.equal(bonus[19].effectiveP2,10);
assert.equal(bonus[20].effectiveP2,10);
approx(bonus[19].raw,bonus[20].raw);
const official={P1:6,P2:3.3,PI:10,ATV:7};
buildP2OutcomeScenarios(official,MODES.PI);
assert.equal(official.P2,3.3);
assert.equal(buildP2OutcomeScenarios({P1:null,P2:8,PI:10,ATV:4},MODES.PI).rows.length,0);

// A meta em centésimos e os cenários de meio ponto usam a mesma decisão.
const reported = { P1: 1, ATV: 7 };
const free = p2Projection(reported, MODES.NONE);
assert.equal(minimumP2(reported, MODES.NONE).required, 7.38);
assert.equal(buildP2OutcomeScenarios(reported, MODES.NONE).firstApproval, 7.5);
assert.equal(buildP2OutcomeScenarios(reported, MODES.NONE).counts.approved, 6);
approx(free.evaluate(7.37).raw, 4.748);
assert.equal(free.evaluate(7.37).status, 'failed');
approx(free.evaluate('7,38').raw, 4.752);
assert.equal(free.evaluate('7,38').status, 'approved');
assert.equal(minimumP2({ ...reported, ATV: 8 }, MODES.NONE).required, 6.88);
assert.equal(minimumP2(reported, MODES.PRESENTATION).required, 6.88);
assert.equal(minimumP2({ ...reported, PI: 7 }, MODES.PI).required, 7.38);

assert.equal(minimumP2({ P1: 10, ATV: 10 }, MODES.NONE).required, 0);
assert.equal(minimumP2({ P1: 0, ATV: 3.75 }, MODES.NONE).required, 10);
const impossible = minimumP2({ P1: 0, ATV: 0 }, MODES.PRESENTATION);
assert.equal(impossible.required, null);
assert.equal(impossible.bestCase, null);
assert.equal(impossible.max.maxRounded, 4);
const depends = minimumP2({ P1: 0, ATV: 5 }, MODES.PI);
assert.equal(depends.required, null);
assert.equal(depends.bestCase, 8.13);
assert.equal(depends.max.maxRounded, 5.5);
assert.equal(minimumP2({ P1: null, ATV: 10 }, MODES.NONE), null);
assert.equal(free.evaluate('10,01'), null);
assert.equal(free.evaluate('7,'), null);
assert.equal(free.evaluate(0).p2, 0);

for (const mode of Object.values(MODES)) {
  for (const base of [reported, { P1: 4.8, PI: 10, ATV: 6.3 }, { P1: 10 }, { P1: 0 }]) {
    const { required, bestCase } = minimumP2(base, mode);
    const { evaluate } = p2Projection(base, mode);
    if (required !== null) assert.equal(evaluate(required).status, 'approved');
    if (required > 0) assert.notEqual(evaluate(Number((required - 0.01).toFixed(2))).status, 'approved');
    if (bestCase === null) assert.equal(evaluate(10).status, 'failed');
  }
}
console.log('PASSOU: fórmulas, arredondamento, 21 cenários, meta em centésimos, limites e projeções.');
