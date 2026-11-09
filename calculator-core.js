/* Núcleo matemático do MinhaNota. Sem dependência do DOM. */
(function exposeCore(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MediaCertaCore = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, function createCore() {
  'use strict';

  const PASS_TARGET = 4.75;
  const P2_DECIMAL_PLACES = 2;
  const P2_STEPS_PER_POINT = 10 ** P2_DECIMAL_PLACES;
  const MODES = Object.freeze({ PI: 'pi', PRESENTATION: 'presentation', NONE: 'none' });
  const COMPONENTS = Object.freeze(['P1', 'P2', 'PI', 'ATV']);
  const WEIGHTS_BY_MODE = Object.freeze({
    pi: Object.freeze({ P1: 0.4, P2: 0.4, PI: 0.1, ATV: 0.1 }),
    presentation: Object.freeze({ P1: 0.4, P2: 0.4, ATV: 0.2 }),
    none: Object.freeze({ P1: 0.4, P2: 0.4, ATV: 0.2 })
  });

  function normalizeMode(mode) {
    return Object.values(MODES).includes(mode) ? mode : MODES.PI;
  }

  function activeComponents(mode = MODES.PI) {
    return normalizeMode(mode) === MODES.PI ? ['P1', 'P2', 'PI', 'ATV'] : ['P1', 'P2', 'ATV'];
  }

  function weightsFor(mode = MODES.PI) {
    return WEIGHTS_BY_MODE[normalizeMode(mode)];
  }

  function parseGrade(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 && raw <= 10 ? raw : null;
    const text = String(raw ?? '').trim();
    if (!text || /[.,]$/.test(text)) return null;
    if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return null;
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 10) return null;
    return value;
  }

  function normalizeGrades(grades = {}) {
    const result = {};
    COMPONENTS.forEach((key) => { result[key] = parseGrade(grades[key]); });
    return result;
  }

  function effectiveGrades(grades, mode = MODES.PI) {
    const normalizedMode = normalizeMode(mode);
    const result = normalizeGrades(grades);
    if (normalizedMode !== MODES.PI) result.PI = null;
    if (normalizedMode === MODES.PRESENTATION && result.P2 !== null) {
      result.P2 = Math.min(10, result.P2 + 0.5);
    }
    return result;
  }

  function calculateAverage(grades) {
    return ((grades.P1 + grades.P2) * 0.8) / 2 + ((grades.PI + grades.ATV) * 0.2) / 2;
  }

  function calculateAverageForMode(grades, mode = MODES.PI) {
    const normalizedMode = normalizeMode(mode);
    const effective = effectiveGrades(grades, normalizedMode);
    const active = activeComponents(normalizedMode);
    if (!active.every((key) => Number.isFinite(effective[key]))) return null;
    if (normalizedMode === MODES.PI) return calculateAverage(effective);
    const weights = weightsFor(normalizedMode);
    return active.reduce((sum, key) => sum + effective[key] * weights[key], 0);
  }

  function partialForMode(grades, mode = MODES.PI) {
    const effective = effectiveGrades(grades, mode);
    const active = activeComponents(mode);
    const weights = weightsFor(mode);
    let points = 0;
    const known = [];
    const missing = [];
    active.forEach((key) => {
      if (Number.isFinite(effective[key])) {
        points += effective[key] * weights[key];
        known.push(key);
      } else missing.push(key);
    });
    return { points, known, missing, total: active.length, weights, effective };
  }

  // Prepara notas para uma projeção sem gravar hipóteses nos dados oficiais.
  // Por especificação, ATV vazia equivale a 0 apenas nas projeções que não calculam a própria ATV.
  function prepareProjectionGrades(grades, mode = MODES.PI, target = null) {
    const normalized = normalizeGrades(grades);
    const normalizedMode = normalizeMode(mode);
    if (normalizedMode !== MODES.PI) normalized.PI = null;
    if (target !== 'ATV' && normalized.ATV === null) normalized.ATV = 0;
    return normalized;
  }

  function customRound(raw) {
    if (!Number.isFinite(raw)) return null;
    const integer = Math.floor(raw);
    const fraction = raw - integer;
    const epsilon = 1e-12;
    if (fraction >= 0.75 - epsilon) return Math.min(10, integer + 1);
    if (fraction >= 0.25 - epsilon) return Math.min(10, integer + 0.5);
    return Math.max(0, Math.min(10, integer));
  }

  // Primeiro valor da escala de 0,5 que seja maior ou igual à nota-base.
  function firstHalfPointAtOrAbove(value) {
    if (!Number.isFinite(Number(value))) return 0;
    const bounded = Math.max(0, Math.min(10, Number(value)));
    return Math.max(0, Math.min(10, Math.ceil((bounded - 1e-10) * 2) / 2));
  }

  function buildHalfPointScenarios(start = 0) {
    const first = firstHalfPointAtOrAbove(start);
    const count = Math.floor((10 - first) * 2 + 1e-9) + 1;
    return Array.from({ length: Math.max(0, count) }, (_, index) => Number((first + index * 0.5).toFixed(1)))
      .filter((grade) => grade >= first - 1e-9 && grade <= 10 + 1e-9);
  }

  function p2Projection(grades, mode = MODES.PI) {
    const normalizedMode = normalizeMode(mode);
    const projected = prepareProjectionGrades(grades, normalizedMode, 'P2');
    const missingPI = normalizedMode === MODES.PI && projected.PI === null;

    function evaluate(p2) {
      if (projected.P1 === null || parseGrade(p2) === null) return null;
      const trial = { ...projected, P2: p2 };
      const raw = calculateAverageForMode(trial, normalizedMode);
      const minRaw = missingPI ? calculateAverageForMode({ ...trial, PI: 0 }, normalizedMode) : raw;
      const maxRaw = missingPI ? calculateAverageForMode({ ...trial, PI: 10 }, normalizedMode) : raw;
      const minRounded = customRound(minRaw);
      const maxRounded = customRound(maxRaw);
      const status = minRounded >= 5 ? 'approved' : maxRounded < 5 ? 'failed' : 'undetermined';
      return {
        p2, effectiveP2: effectiveGrades(trial, normalizedMode).P2,
        raw, rounded: customRound(raw), minRaw, maxRaw, minRounded, maxRounded, status
      };
    }

    return { evaluate, missingPI, hasP1: projected.P1 !== null, assumedATV: parseGrade(grades.ATV) === null };
  }

  // A média só cresce (ou permanece igual) com a P2. Buscamos na mesma
  // escala do formulário usando a decisão de aprovação da própria projeção.
  function minimumP2(grades, mode = MODES.PI) {
    const { evaluate, missingPI } = p2Projection(grades, mode);
    const max = evaluate(10);
    if (!max) return null;

    function firstPassing(roundedKey) {
      if (max[roundedKey] < 5) return null;
      let low = 0;
      let high = 10 * P2_STEPS_PER_POINT;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (evaluate(middle / P2_STEPS_PER_POINT)[roundedKey] >= 5) high = middle;
        else low = middle + 1;
      }
      return low / P2_STEPS_PER_POINT;
    }

    const required = firstPassing('minRounded');
    return { required, bestCase: missingPI ? firstPassing('maxRounded') : required, max, missingPI };
  }

  function buildP2OutcomeScenarios(grades, mode = MODES.PI) {
    const { evaluate, hasP1, assumedATV, missingPI } = p2Projection(grades, mode);
    const rows = hasP1 ? buildHalfPointScenarios(0).map(evaluate) : [];
    const counts = { approved: 0, failed: 0, undetermined: 0 };
    rows.forEach((row) => { counts[row.status] += 1; });
    return {
      rows, counts, firstApproval: rows.find((row) => row.status === 'approved')?.p2 ?? null,
      assumedATV, missingPI
    };
  }

  return {
    PASS_TARGET, P2_DECIMAL_PLACES, MODES, COMPONENTS, WEIGHTS: WEIGHTS_BY_MODE.pi,
    WEIGHTS_BY_MODE, normalizeMode, activeComponents, weightsFor, parseGrade,
    normalizeGrades, effectiveGrades, calculateAverage, calculateAverageForMode,
    partialForMode, prepareProjectionGrades, customRound, firstHalfPointAtOrAbove, buildHalfPointScenarios,
    p2Projection, minimumP2, buildP2OutcomeScenarios
  };
});
