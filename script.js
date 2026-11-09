/* MinhaNota — interface e persistência local. */
(() => {
  'use strict';
  const CORE = window.MediaCertaCore;
  const { COMPONENTS, MODES, P2_DECIMAL_PLACES, parseGrade, normalizeGrades, normalizeMode,
    activeComponents, partialForMode, p2Projection, minimumP2, buildP2OutcomeScenarios } = CORE;
  const STORAGE_KEY = 'media-certa-state-v1';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const blankGrades = () => ({ P1: '', P2: '', PI: '', ATV: '' });
  const blankHypotheses = () => ({ P2: '', ATV: '' });
  const defaultName = 'Minha disciplina';
  let tableOpen = false;
  let p2Draft = null;

  function initialState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.subjects) && saved.subjects.length) {
        const subjects = saved.subjects.map((subject) => ({
          ...subject,
          id: String(subject?.id || makeId()),
          name: subject?.name || defaultName,
          grades: { ...blankGrades(), ...subject?.grades },
          mode: Object.values(MODES).includes(subject?.mode) ? subject.mode : MODES.NONE,
          hypotheses: { ...blankHypotheses(), ...subject?.hypotheses }
        }));
        const activeId = subjects.find((subject) => subject.id === String(saved.activeId))?.id ?? subjects[0].id;
        return { ...saved, subjects, activeId, history: Array.isArray(saved.history) ? saved.history : [] };
      }
    } catch (_) { /* Continua sem armazenamento local. */ }
    const subject = { id: makeId(), name: defaultName, grades: blankGrades(), mode: MODES.NONE, hypotheses: blankHypotheses() };
    return { subjects: [subject], activeId: subject.id, history: [] };
  }

  const state = initialState();
  const activeSubject = () => state.subjects.find((subject) => subject.id === state.activeId);
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) { return false; }
  }

  function toast(message) {
    const host = $('#toast-region');
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    host.replaceChildren(node);
    window.setTimeout(() => node.remove(), 3500);
  }

  function number(value, places = 3) {
    return value.toFixed(places).replace('.', ',');
  }

  function grade(value) {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 20 });
  }

  function gradeIssue(raw, limitP2 = false) {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    if (parseGrade(value) === null) return 'Informe uma nota de 0 a 10.';
    if (limitP2 && (value.split(/[.,]/)[1]?.length ?? 0) > P2_DECIMAL_PLACES) return 'Use até duas casas decimais na P2.';
    return '';
  }

  function getIssues(subject, draft = null) {
    return activeComponents(subject.mode).filter((key) => key === 'P2' && draft !== null
      ? gradeIssue(draft, true) : gradeIssue(subject.grades[key]));
  }

  function markInput(input, issue) {
    input.setAttribute('aria-invalid', String(Boolean(issue)));
    const message = $(`#issue-${input.dataset.grade}`);
    if (!message) return;
    message.textContent = issue;
    message.hidden = !issue;
  }

  function updateModePresentation(subject) {
    $('#assessment-mode-select').value = subject.mode;
    $('#field-PI').hidden = subject.mode !== MODES.PI;
    $('#mode-note').textContent = {
      pi: 'P1 e P2 40% cada · PI 10% · ATV 10%',
      presentation: 'P1 e P2 40% cada · ATV 20% · bônus de até 0,5 na P2',
      none: 'P1 e P2 40% cada · ATV 20%'
    }[subject.mode];
    const rawP2 = parseGrade(subject.grades.P2);
    const bonus = $('#p2-effective-note');
    bonus.hidden = subject.mode !== MODES.PRESENTATION;
    bonus.textContent = rawP2 === null || p2Draft !== null
      ? 'O bônus é somado à P2 até o limite de 10,0.'
      : `P2 com bônus: ${number(Math.min(10, rawP2 + 0.5))}.`;
  }

  function disciplineForSubject(subject) {
    return String(subject.discipline ?? (subject.name === defaultName ? '' : subject.name)).trim().slice(0, 80);
  }

  function renderInputs() {
    const subject = activeSubject();
    $$('[data-grade]').forEach((input) => {
      const key = input.dataset.grade;
      input.value = key === 'P2' && p2Draft !== null ? p2Draft : subject.grades[key] ?? '';
      markInput(input, gradeIssue(input.value, key === 'P2' && p2Draft !== null));
    });
    $('#discipline-name').value = disciplineForSubject(subject);
    $('#simulator-P2').value = subject.hypotheses.P2 ?? '';
    $('#simulator-ATV').value = subject.hypotheses.ATV ?? '';
    updateModePresentation(subject);
  }

  function rawText(row) {
    return row.raw === null ? `${number(row.minRaw)}–${number(row.maxRaw)}` : number(row.raw);
  }

  function finalText(row) {
    return row.minRounded === row.maxRounded ? number(row.minRounded, 1) : `${number(row.minRounded, 1)}–${number(row.maxRounded, 1)}`;
  }

  function statusText(row, projected = false) {
    if (row.status === 'approved') return projected ? 'Aprovado na projeção' : 'Aprovado';
    if (row.status === 'failed') return projected ? 'Abaixo da média na projeção' : 'Abaixo da média';
    return 'Depende da PI';
  }

  function assumptions(grades, mode) {
    const messages = [];
    if (grades.P1 === null) messages.push('P1 em branco: 0 na projeção.');
    if (grades.ATV === null) messages.push('ATV em branco: 0 na projeção.');
    if (mode === MODES.PI && grades.PI === null) messages.push('PI pendente: faixa de 0 a 10.');
    return messages.join(' ');
  }

  function targetText(target) {
    if (!target) return 'Informe a P1';
    if (target.bestCase === null) return 'A média não é alcançável';
    if (target.required === null) return 'A meta depende da PI';
    if (target.required === 0) return 'P2 igual a zero já é suficiente';
    return `Você precisa de ${number(target.required, P2_DECIMAL_PLACES)} na P2`;
  }

  function targetDetail(target) {
    if (!target) return '';
    if (target.bestCase === null) return `Mesmo com P2 igual a 10, a média final máxima projetada é ${number(target.max.maxRounded, 1)}.`;
    if (target.required === null) return `Com PI igual a 10, a menor P2 seria ${number(target.bestCase, P2_DECIMAL_PLACES)}. Com PI igual a 0, a média não seria alcançável.`;
    if (target.missingPI && target.required > 0) return `Essa meta garante a média com PI igual a 0. Com PI igual a 10, a menor P2 seria ${number(target.bestCase, P2_DECIMAL_PLACES)}.`;
    if (target.required === 0) return 'Com as notas e hipóteses usadas, P2 igual a 0 já atinge o corte de 5,0.';
    return 'Meta para atingir 5,0 após o arredondamento.';
  }

  function currentOutcome(grades, mode) {
    return p2Projection({ ...grades, P1: grades.P1 ?? 0 }, mode).evaluate(grades.P2);
  }

  function renderCurrentResult(subject, grades, issues, target) {
    const host = $('#result-panel');
    if (issues.length) {
      host.innerHTML = '<p class="result-status failed">Corrija as notas inválidas para calcular o resultado.</p>';
      return;
    }
    const { points, missing } = partialForMode(grades, subject.mode);
    const projection = grades.P2 !== null || target !== null ? assumptions(grades, subject.mode) : '';
    const notes = missing.length ? `<p class="muted">Pendentes: ${missing.join(', ')}.</p>` : '';
    const context = projection ? `<p class="assumption-note">${projection}</p>` : '';
    if (grades.P2 === null) {
      host.innerHTML = `<p class="result-status">P2 pendente${target ? ' · Projeção' : ''}</p>
        <p class="result-answer">${targetText(target)}</p>
        ${target ? `<p>${targetDetail(target)}</p><p class="muted precision-note">Meta calculada com duas casas decimais no formulário.</p>` : '<p>Use a P1 para calcular sua meta da P2.</p>'}
        ${context}<p class="muted">Pontos parciais: <strong>${number(points)}</strong>.</p>${notes}`;
      return;
    }
    const row = currentOutcome(grades, subject.mode);
    host.innerHTML = `<p class="result-status">Média final${missing.length ? ' · Projeção' : ''}</p>
      <p class="result-answer result-score">${finalText(row)}</p><p>Média bruta <strong>${rawText(row)}</strong></p>
      <p class="result-status ${row.status}">${statusText(row, Boolean(missing.length))}</p>${context}${notes}`;
  }

  function renderScenarioTable(subject, grades, issues) {
    $('#toggle-simulator').setAttribute('aria-expanded', String(tableOpen));
    $('#toggle-simulator-label').textContent = tableOpen ? 'Ocultar os 21 cenários' : 'Ver 21 cenários da P2';
    $('#toggle-simulator-icon').textContent = tableOpen ? '↑' : '↓';
    $('#scenario-content').hidden = !tableOpen;
    if (!tableOpen) return;
    const unavailable = issues.length || grades.P1 === null;
    $('#scenario-table-wrap').hidden = Boolean(unavailable);
    const summary = $('#scenario-summary');
    const body = $('#scenario-table-body');
    if (unavailable) {
      summary.textContent = issues.length ? 'Corrija as notas inválidas para ver os cenários.' : 'Informe a P1 para comparar os 21 cenários.';
      body.replaceChildren();
      return;
    }
    const { rows, counts, firstApproval } = buildP2OutcomeScenarios(grades, subject.mode);
    const countText = counts.approved === 1 ? '1 dos 21 cenários simulados atinge a média' : `${counts.approved} dos 21 cenários simulados atingem a média`;
    summary.textContent = `${countText}${counts.undetermined ? ` com garantia. ${counts.undetermined} dependem da PI` : ''}.`;
    $('#scenario-footnote').textContent = ['P2 de 0,0 a 10,0 em passos de 0,5.', assumptions(grades, subject.mode)].filter(Boolean).join(' ');
    body.innerHTML = rows.map((row) => {
      const first = firstApproval === row.p2;
      return `<tr${first ? ' class="first-pass"' : ''}>
        <th scope="row">${number(row.p2, 1)}${first ? '<span class="row-flag">Primeira aprovação da tabela</span>' : ''}${row.p2 === grades.P2 ? '<span class="row-flag actual-flag">Sua nota</span>' : ''}</th>
        <td class="number">${rawText(row).replace('–', '–<wbr>')}</td><td class="number final-score">${finalText(row).replace('–', '–<wbr>')}</td>
        <td class="${row.status}">${statusText(row)}</td></tr>`;
    }).join('');
  }

  function getHypotheses(subject) {
    const errors = { P2: gradeIssue(subject.hypotheses.P2, true), ATV: gradeIssue(subject.hypotheses.ATV) };
    return {
      errors,
      P2: errors.P2 ? null : parseGrade(subject.hypotheses.P2),
      ATV: errors.ATV ? null : parseGrade(subject.hypotheses.ATV)
    };
  }

  function compactTarget(target) {
    if (target.bestCase === null) return `Inviável (máx. ${number(target.max.maxRounded, 1)})`;
    if (target.required === null) return `Depende da PI (a partir de ${number(target.bestCase, P2_DECIMAL_PLACES)})`;
    return `${number(target.required, P2_DECIMAL_PLACES)} na P2`;
  }

  function renderHypotheses(subject, grades, issues, target) {
    const { P2, ATV, errors } = getHypotheses(subject);
    markInput($('#simulator-P2'), errors.P2);
    markInput($('#simulator-ATV'), errors.ATV);
    const free = $('#free-result');
    const comparison = $('#atv-comparison');
    const projected = { ...grades, ATV: ATV ?? grades.ATV };
    const freeRow = issues.length ? null : p2Projection(projected, subject.mode).evaluate(P2);
    if (errors.P2 || (P2 !== null && errors.ATV)) {
      free.innerHTML = `<p class="failed">${errors.P2 || 'Corrija ou limpe a ATV hipotética para simular.'}</p>`;
    } else if (freeRow) {
      const context = [ATV === null ? '' : `ATV hipotética de ${grade(ATV)}.`, assumptions(projected, subject.mode)].filter(Boolean).join(' ');
      free.innerHTML = `<p class="${freeRow.status}"><strong>${statusText(freeRow, true)}</strong></p><p>Média bruta <strong>${rawText(freeRow)}</strong> · Média final <strong>${finalText(freeRow)}</strong></p>${context ? `<p class="muted">${context}</p>` : ''}`;
    } else {
      free.innerHTML = `<p class="muted">${P2 === null ? 'Digite uma P2 para ver a média simulada.' : 'Informe a P1 e confira as notas para simular.'}</p>`;
    }
    if (errors.ATV) {
      comparison.innerHTML = `<p class="failed">${errors.ATV}</p>`;
    } else if (!target) {
      comparison.innerHTML = '<p class="muted">Informe a P1 e confira as notas para comparar as metas.</p>';
    } else {
      const hypothetical = ATV === null ? null : minimumP2(projected, subject.mode);
      const originalLabel = grades.ATV === null ? 'ATV pendente (0 na projeção)' : `ATV informada de ${grade(grades.ATV)}`;
      const altLabel = ATV === null ? 'ATV hipotética' : `ATV hipotética de ${grade(ATV)}`;
      comparison.innerHTML = `<dl class="comparison"><div><dt>${originalLabel}</dt><dd>${compactTarget(target)}</dd></div>
        <div><dt>${altLabel}</dt><dd>${hypothetical ? compactTarget(hypothetical) : 'Informe uma hipótese'}</dd></div></dl>
        ${target.missingPI ? '<p class="muted">A PI está pendente. Uma meta numérica garante a média mesmo com PI igual a 0.</p>' : ''}`;
    }
  }

  function calculatorState() {
    const subject = activeSubject();
    const grades = normalizeGrades(subject.grades);
    const issues = getIssues(subject, p2Draft);
    const target = issues.length ? null : minimumP2(grades, subject.mode);
    return { subject, grades, issues, target };
  }

  function renderCalculator() {
    const { subject, grades, issues, target } = calculatorState();
    renderCurrentResult(subject, grades, issues, target);
    renderScenarioTable(subject, grades, issues);
    renderHypotheses(subject, grades, issues, target);
    $('#manual-copy').hidden = true;
  }

  function entryDiscipline(entry) {
    if (typeof entry.discipline === 'string') return entry.discipline.trim();
    const subject = state.subjects.find((item) => item.id === String(entry.subjectId));
    const label = String(entry.label || subject?.name || '').trim();
    return label === defaultName ? '' : label;
  }

  function entryResult(entry) {
    const mode = normalizeMode(entry.mode);
    const grades = normalizeGrades(entry.grades);
    if (getIssues({ mode, grades: entry.grades ?? {} }).length) return 'Confira as notas';
    if (grades.P2 !== null) {
      const projected = activeComponents(mode).some((key) => grades[key] === null);
      return `Média final ${finalText(currentOutcome(grades, mode))}${projected ? ' · Projeção' : ''}`;
    }
    const target = minimumP2(grades, mode);
    return target ? `Meta: ${compactTarget(target)} · Projeção` : 'P2 pendente · Informe a P1';
  }

  function renderDisciplineSummary() {
    const entries = state.history.filter(Boolean).reverse().sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    const byDiscipline = new Map();
    for (const entry of entries) {
      const discipline = entryDiscipline(entry).normalize('NFC').toLocaleLowerCase('pt-BR');
      if (!byDiscipline.has(discipline)) byDiscipline.set(discipline, entry);
    }
    const empty = '<p class="muted summary-empty">Nenhum cenário salvo ainda.</p>';
    $('#discipline-summary').innerHTML = byDiscipline.size ? `<ul class="discipline-list">${Array.from(byDiscipline.values(), (entry) => `
      <li><strong>${escapeHTML(entryDiscipline(entry) || 'Sem disciplina')}</strong><span>${entryResult(entry)}</span>
      <button class="button button-secondary" type="button" data-restore-history="${escapeHTML(entry.id)}" aria-label="Abrir cenário de ${escapeHTML(entryDiscipline(entry) || 'Sem disciplina')}">Abrir cenário</button></li>`).join('')}</ul>` : empty;
  }

  function saveSnapshot() {
    const subject = activeSubject();
    if (getIssues(subject, p2Draft).length) { toast('Corrija as notas inválidas antes de salvar.'); return; }
    const grades = normalizeGrades(subject.grades);
    if (!activeComponents(subject.mode).some((key) => grades[key] !== null)) { toast('Preencha alguma nota antes de salvar.'); return; }
    const { errors, P2, ATV } = getHypotheses(subject);
    if (errors.P2 || errors.ATV) { toast('Corrija ou limpe as hipóteses inválidas antes de salvar.'); return; }
    const row = grades.P2 === null ? null : currentOutcome(grades, subject.mode);
    const discipline = disciplineForSubject(subject);
    state.history.push({
      id: makeId(), subjectId: subject.id, label: discipline || defaultName, discipline, createdAt: Date.now(),
      grades: { ...subject.grades }, mode: subject.mode, target: 'P2', raw: row?.raw ?? null,
      rounded: row?.rounded ?? null, atvAssumedZero: grades.ATV === null,
      hypotheses: { P2: P2 === null ? '' : subject.hypotheses.P2, ATV: ATV === null ? '' : subject.hypotheses.ATV }
    });
    const persisted = saveState();
    renderDisciplineSummary();
    toast(persisted ? 'Cenário salvo neste navegador.' : 'Cenário disponível nesta sessão. O armazenamento está indisponível.');
  }

  function restoreSnapshot(id) {
    const entry = state.history.find((item) => String(item?.id) === id);
    if (!entry) return;
    const subject = state.subjects.find((item) => item.id === String(entry.subjectId)) || activeSubject();
    state.activeId = subject.id;
    subject.grades = { ...blankGrades(), ...entry.grades };
    subject.mode = normalizeMode(entry.mode);
    subject.discipline = entryDiscipline(entry);
    subject.hypotheses = { ...blankHypotheses(), ...entry.hypotheses };
    p2Draft = null;
    saveState();
    renderInputs();
    renderCalculator();
    $('#notes-page-title').focus();
    window.scrollTo({ top: 0, behavior: 'instant' });
    toast('Cenário restaurado.');
  }

  function shareTarget(target) {
    if (target.required === null) return `${targetText(target)}. ${targetDetail(target)}`;
    if (target.required === 0) return 'P2 igual a zero já é suficiente';
    return `Preciso de ${number(target.required, P2_DECIMAL_PLACES)} na P2${target.missingPI ? ' para garantir a média com PI pendente' : ''}`;
  }

  function shareSummary(subject) {
    const grades = normalizeGrades(subject.grades);
    const mode = subject.mode;
    const target = minimumP2(grades, mode);
    if (getIssues(subject, p2Draft).length || (grades.P2 === null && !target)) return '';
    const projected = assumptions(grades, mode);
    let summary;
    if (grades.P2 === null) {
      summary = shareTarget(target);
      if (grades.ATV !== null) summary += `${target.required === null ? ' · ATV' : ' com ATV'} ${grade(grades.ATV)}`;
    } else {
      const row = currentOutcome(grades, mode);
      summary = `Média final ${finalText(row)} · média bruta ${rawText(row)} · ${statusText(row, Boolean(projected))}`;
    }
    const parts = [[disciplineForSubject(subject), summary].filter(Boolean).join(' · ')];
    if (projected) parts.push(`Projeção: ${projected}`);
    const { P2, ATV, errors } = getHypotheses(subject);
    const altGrades = { ...grades, ATV: ATV ?? grades.ATV };
    if (ATV !== null && target) parts.push(`Com ATV hipotética ${grade(ATV)}: ${shareTarget(minimumP2(altGrades, mode))}`);
    const trial = p2Projection(altGrades, mode).evaluate(P2);
    if (trial && !errors.ATV) parts.push(`P2 hipotética ${grade(P2)}${ATV === null ? '' : ` com ATV hipotética ${grade(ATV)}`}: média bruta ${rawText(trial)}, média final ${finalText(trial)} · ${statusText(trial, true)}`);
    return parts.join('\n');
  }

  async function copySummary() {
    const summary = shareSummary(activeSubject());
    if (!summary) { toast('Confira as notas para gerar um resumo.'); return; }
    try {
      await navigator.clipboard.writeText(summary);
    } catch (_) {
      const input = $('#manual-copy-text');
      $('#manual-copy').hidden = false;
      input.value = summary;
      input.focus();
      input.select();
      toast('Resumo selecionado para copiar.');
      return;
    }
    $('#manual-copy').hidden = true;
    toast('Resumo copiado. Cole onde quiser.');
  }

  function changeView(view) {
    $$('.nav-link').forEach((button) => {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $$('.view').forEach((section) => { section.hidden = section.id !== `view-${view}`; });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  $$('.nav-link').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.view)));
  $('[data-go-view]').addEventListener('click', () => { changeView('notes'); $('#notes-page-title').focus(); });
  $('[data-brand-home]').addEventListener('click', (event) => { event.preventDefault(); changeView('intro'); });
  $('#assessment-mode-select').addEventListener('change', (event) => {
    activeSubject().mode = event.target.value;
    saveState(); updateModePresentation(activeSubject()); renderCalculator();
  });
  $('#clear-grades').addEventListener('click', () => {
    if (!window.confirm('Limpar todas as notas informadas da disciplina atual?')) return;
    activeSubject().grades = blankGrades();
    p2Draft = null;
    saveState(); renderInputs(); renderCalculator();
    toast('Notas informadas limpas.');
  });
  $('#save-snapshot').addEventListener('click', saveSnapshot);
  $('#copy-summary').addEventListener('click', copySummary);
  $('#discipline-name').addEventListener('input', (event) => {
    activeSubject().discipline = event.target.value;
    $('#manual-copy').hidden = true;
    saveState();
  });
  $$('[data-grade]').forEach((input) => {
    const key = input.dataset.grade;
    input.addEventListener('input', () => {
      const issue = gradeIssue(input.value, key === 'P2');
      if (key === 'P2') p2Draft = issue ? input.value : null;
      if (key !== 'P2' || !issue) activeSubject().grades[key] = input.value;
      markInput(input, issue);
      saveState(); updateModePresentation(activeSubject()); renderCalculator();
    });
    input.addEventListener('blur', () => {
      const valid = parseGrade(input.value);
      if (valid === null || (key === 'P2' && p2Draft !== null)) return;
      input.value = grade(valid).replace(/,0$/, '');
      activeSubject().grades[key] = input.value;
      saveState();
    });
  });
  for (const key of ['P2', 'ATV']) {
    const input = $(`#simulator-${key}`);
    const update = () => {
      activeSubject().hypotheses[key] = input.value;
      const { subject, grades, issues, target } = calculatorState();
      saveState();
      renderHypotheses(subject, grades, issues, target);
      $('#manual-copy').hidden = true;
    };
    input.addEventListener('input', update);
    $(`#clear-simulated-${key.toLowerCase()}`).addEventListener('click', () => { input.value = ''; update(); input.focus(); });
  }
  function setTableOpen(open) {
    tableOpen = open;
    const subject = activeSubject();
    renderScenarioTable(subject, normalizeGrades(subject.grades), getIssues(subject, p2Draft));
  }
  $('#toggle-simulator').addEventListener('click', () => setTableOpen(!tableOpen));
  $('#close-simulator').addEventListener('click', () => {
    setTableOpen(false);
    $('#toggle-simulator').focus();
  });
  $('#discipline-summary').addEventListener('click', (event) => {
    const restore = event.target.closest('[data-restore-history]');
    if (restore) restoreSnapshot(restore.dataset.restoreHistory);
  });
  window.MediaCerta = CORE;
  renderInputs(); renderCalculator(); renderDisciplineSummary(); saveState();
  changeView('intro');
  window.addEventListener('pageshow', (event) => { if (event.persisted) changeView('intro'); });
})();
