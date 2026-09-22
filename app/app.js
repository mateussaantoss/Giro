/* GIRO frontend — rotas por hash, sem dependências de runtime. */
(() => {
  'use strict';
  const { statuses, seed } = window.GiroData;
  const STORAGE = 'giro-demo-v2';
  let state;
  try { state = JSON.parse(localStorage.getItem(STORAGE)) || seed(); } catch (_) { state = seed(); }
  if (!Array.isArray(state.orders) || !state.settings) state = seed();
  const ui = { collapsed: false, query: '', mechanic: '', status: '', priority: '', tab: 'Todas', view: matchMedia('(max-width: 760px)').matches ? 'list' : 'board', chat: 1, chatList: false, report: 7, settings: 'Oficina', signup: 1, signupData: {}, signupErrors: {}, loginErrors: {}, submitting: false, authChecked: false, authChecking: false, session: null };
  const brazilianStates = [
    ['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']
  ].map(([uf,name]) => ({ uf, name }));
  const brazilianDdds = new Set(['11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99']);
  const cityCache = new Map();
  const cityLoads = new Map();
  const app = document.getElementById('app');
  const modal = document.getElementById('modal');
  let restoreFocus;
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    wrench: '<path d="M14.5 6.5a5 5 0 0 0-6.7 6.7L3 18a2.1 2.1 0 0 0 3 3l4.8-4.8a5 5 0 0 0 6.7-6.7l-3 3-3-3z"/>',
    clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6M9 19h4"/>',
    users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v3"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    car: '<path d="m5 6-2 7v6h3v-3h12v3h3v-6l-2-7zM3 12h18M7 6l1-3h8l1 3M6 14h2M16 14h2"/>',
    chat: '<path d="M21 11.5a9 9 0 0 1-13.5 7.8L3 21l1.7-4.5A9 9 0 1 1 21 11.5Z"/><path d="M8 8c0 4 4 8 8 7l1-2-3-1-1 1-3-3 1-1-1-2z"/>',
    history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
    chart: '<path d="M3 3v18h18M7 16v-4M12 16V7M17 16v-7"/>',
    settings: '<path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 3 3-1 2 3 4-1 1-3 3-1 1-4-3-2 1-3-3-3z"/><circle cx="12" cy="12" r="3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 3M12 17h.01"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    left: '<path d="m14 6-6 6 6 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    up: '<path d="m5 16 6-6 4 3 6-8M15 5h6v6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    alert: '<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',
    box: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7 5l9 5"/>',
    wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M20 11h-6v5h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h2"/>',
    board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M5 8h2M11 8h2M17 8h2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    logout: '<path d="M9 3H4v18h5M10 12h11m-5-5 5 5-5 5"/>',
    camera: '<path d="m8 6 2-3h4l2 3h5v15H3V6z"/><circle cx="12" cy="13" r="4"/>',
    note: '<path d="M14 3H4v18h16V9zM14 3v6h6M8 13h8M8 17h6"/>',
    play: '<path d="m7 3 14 9-14 9z"/>',
    pause: '<path d="M7 4v16M17 4v16"/>',
    send: '<path d="m22 2-7 20-4-9L2 9zM11 13 22 2"/>',
    bot: '<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M2 12h2M20 12h2M8 12h.01M16 12h.01M8 17h8"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6zM8 12l3 3 5-6"/>',
    grip: '<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
  const sun = '<svg class="icon ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  const moon = '<svg class="icon ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
  const themeBtn = () => `<button class="icon-btn theme-toggle" data-action="theme" aria-label="Alternar modo claro e escuro">${sun}${moon}</button>`;
  const cssVar = (name, fallback) => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; };
  const applyTheme = theme => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('giro-theme', theme); } catch (_) {} const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.setAttribute('content', theme === 'light' ? '#f0f2ed' : '#0b0f14'); };
  let savedTheme = null;
  try { savedTheme = localStorage.getItem('giro-theme'); } catch (_) {}
  if (savedTheme) applyTheme(savedTheme); else if (!document.documentElement.getAttribute('data-theme')) applyTheme(matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const phoneDigits = value => String(value || '').replace(/\D/g, '').slice(0,11);
  function formatBrazilianPhone(value) {
    const digits = phoneDigits(value);
    if (!digits) return '';
    if (digits.length < 3) return `(${digits}`;
    const number = digits.slice(2);
    return `(${digits.slice(0,2)}) ${number.length > 5 ? `${number.slice(0,5)}-${number.slice(5)}` : number}`;
  }
  const isValidBrazilianMobile = value => { const digits = phoneDigits(value); return digits.length === 11 && brazilianDdds.has(digits.slice(0,2)) && digits[2] === '9'; };
  const normalizeSpaces = value => String(value || '').trim().replace(/\s+/g,' ');
  function isValidEmail(value) {
    value = String(value || '').trim();
    if (!value || value.length > 254 || /\s/.test(value)) return false;
    const parts = value.split('@'); if (parts.length !== 2) return false;
    const [local,domain] = parts;
    if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
    const labels = domain.split('.');
    return labels.length >= 2 && labels.every(label => label && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)) && /^[A-Za-z]{2,}$/.test(labels.at(-1));
  }
  const fieldErrorMarkup = (name,error = '') => `<span class="field-error" data-field-error="${name}" aria-live="polite">${esc(error)}</span>`;
  function fieldControl(form,name) {
    if (['state','city'].includes(name)) return form.querySelector(`[data-combobox="${name}"] [role="combobox"]`);
    return form.elements[name] || null;
  }
  function setFieldError(form,name,message = '') {
    const error = form.querySelector(`[data-field-error="${name}"]`), control = fieldControl(form,name);
    if (error) error.textContent = message;
    if (control) { if (message) control.setAttribute('aria-invalid','true'); else control.removeAttribute('aria-invalid'); }
  }
  function signupFieldError(form,name) {
    const value = name === 'terms' ? form.elements.terms?.checked : name === 'state' || name === 'city' ? form.elements[name]?.value : form.elements[name]?.value ?? '';
    if (name === 'name') {
      const normalized = normalizeSpaces(value);
      if (!normalized) return 'Informe seu nome.';
      if (normalized.length < 3 || normalized.length > 80 || (normalized.match(/\p{L}/gu) || []).length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M}' -]*$/u.test(normalized)) return 'Informe um nome válido, usando apenas letras.';
    }
    if (name === 'phone' && !isValidBrazilianMobile(value)) return 'Informe um número de WhatsApp válido.';
    if (name === 'workshop') { const normalized = normalizeSpaces(value); if (normalized.length < 3 || normalized.length > 70 || !/[\p{L}\p{N}]/u.test(normalized)) return 'Informe o nome da oficina.'; }
    if (name === 'state' && !stateByUf(value)) return 'Selecione um estado.';
    if (name === 'city') {
      if (!value) return 'Selecione uma cidade.';
      const uf = form.elements.state?.value, cities = cityCache.get(uf);
      if (cities && !cities.includes(value)) return 'Selecione uma cidade pertencente ao estado informado.';
    }
    if (name === 'email' && !isValidEmail(value)) return 'E-mail inválido.';
    if (name === 'password' && (!String(value).trim() || value.length < 8 || value.length > 128)) return 'Use uma senha entre 8 e 128 caracteres.';
    if (name === 'passwordConfirmation' && value !== form.elements.password?.value) return 'As senhas não coincidem.';
    if (name === 'focus' && !['Organizar ordens de serviço','Acompanhar a equipe','Melhorar o atendimento'].includes(value)) return 'Selecione um foco inicial.';
    if (name === 'terms' && !value) return 'Confirme o aceite para continuar.';
    return '';
  }
  const signupFieldsByStep = { 1:['name','phone'],2:['workshop','state','city'],3:['email','password','passwordConfirmation'],4:['focus','terms'] };
  function validateSignupStep(form,showErrors = true) {
    let valid = true;
    for (const name of signupFieldsByStep[ui.signup]) { const error = signupFieldError(form,name); if (showErrors) setFieldError(form,name,error); if (error) valid = false; }
    return valid;
  }
  function updateSignupSubmitState() {
    const form = document.getElementById('signup-form'), button = form?.querySelector('[data-auth-submit]');
    if (button) button.disabled = ui.submitting || !validateSignupStep(form,false);
  }
  function validateLogin(form,showErrors = true) {
    const email = form.elements.email.value.trim(), password = form.elements.password.value;
    const errors = { email:email ? isValidEmail(email) ? '' : 'E-mail inválido.' : 'Informe seu e-mail.', password:password ? password.length <= 128 ? '' : 'Senha inválida.' : 'Informe sua senha.' };
    if (showErrors) Object.entries(errors).forEach(([name,error]) => setFieldError(form,name,error));
    return { valid:!errors.email && !errors.password,email:email.toLowerCase(),password };
  }
  function setAuthSubmitting(form,loading,text) {
    ui.submitting = loading;
    const button = form?.querySelector('[data-auth-submit]'); if (!button) return;
    if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
    button.disabled = loading;
    button.classList.toggle('loading',loading);
    button.innerHTML = loading ? `<span class="button-spinner" aria-hidden="true"></span>${text}` : button.dataset.idleHtml;
  }
  async function authRequest(path,body) {
    const response = await fetch(path,{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(body) });
    let data = {}; try { data = await response.json(); } catch (_) {}
    return { response,data };
  }
  const stateByUf = uf => brazilianStates.find(state => state.uf === uf);
  const stateDisplay = uf => { const state = stateByUf(uf); return state ? `${state.name} - ${state.uf}` : ''; };
  function phoneCaretPosition(value,digitCount) {
    if (!digitCount) return 0;
    let seen = 0;
    for (let i = 0; i < value.length; i++) if (/\d/.test(value[i]) && ++seen === digitCount) return i + 1;
    return value.length;
  }
  function updateSignupPhoneValidity(input,showError = false) {
    if (!input) return true;
    const valid = !input.value || isValidBrazilianMobile(input.value);
    input.setCustomValidity(valid ? '' : 'Informe um celular brasileiro válido com DDD.');
    const error = document.getElementById('signup-phone-error');
    if (error) error.textContent = !valid && showError ? 'Informe um celular válido com DDD e 11 dígitos.' : '';
    return valid;
  }
  function signupLocationFields(data) {
    const uf = stateByUf(data.state)?.uf || '';
    const city = uf ? data.city || '' : '';
    return `<div class="field signup-location-field"><label for="signup-state-search">Estado</label><div class="combobox" data-combobox="state"><div class="combobox-control">${icon('search')}<input id="signup-state-search" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="signup-state-options" autocomplete="off" placeholder="Digite ou selecione..." value="${esc(stateDisplay(uf))}"><button type="button" class="combobox-toggle" data-combo-toggle aria-label="Abrir estados">${icon('chevron')}</button></div><input type="hidden" name="state" value="${esc(uf)}"><div class="combobox-options" id="signup-state-options" role="listbox"></div></div>${fieldErrorMarkup('state',ui.signupErrors.state)}</div><div class="field signup-location-field"><label for="signup-city-search">Cidade</label><div class="combobox" data-combobox="city"><div class="combobox-control">${icon('search')}<input id="signup-city-search" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="signup-city-options" autocomplete="off" placeholder="${uf ? 'Digite ou selecione...' : 'Selecione o estado primeiro'}" value="${esc(city)}" ${uf ? '' : 'disabled'}><button type="button" class="combobox-toggle" data-combo-toggle aria-label="Abrir cidades" ${uf ? '' : 'disabled'}>${icon('chevron')}</button></div><input type="hidden" name="city" value="${esc(city)}"><div class="combobox-options" id="signup-city-options" role="listbox"></div></div>${fieldErrorMarkup('city',ui.signupErrors.city)}</div>`;
  }
  function comboItems(combo) {
    if (combo.dataset.combobox === 'state') return brazilianStates.map(state => ({ value:state.uf,label:`${state.name} - ${state.uf}` }));
    const uf = document.querySelector('#signup-form [name="state"]')?.value;
    return (cityCache.get(uf) || []).map(city => ({ value:city,label:city }));
  }
  function comboMessage(combo) {
    if (combo.dataset.combobox !== 'city') return '';
    const uf = document.querySelector('#signup-form [name="state"]')?.value;
    if (!uf) return 'Selecione um estado para carregar as cidades.';
    if (cityLoads.get(uf) === 'loading') return 'Carregando cidades...';
    if (cityLoads.get(uf) === 'error') return 'Não foi possível carregar. Clique no campo para tentar novamente.';
    return '';
  }
  function renderComboOptions(combo) {
    const input = combo.querySelector('[role="combobox"]'), hidden = combo.querySelector('input[type="hidden"]'), list = combo.querySelector('[role="listbox"]');
    const selectedLabel = combo.dataset.combobox === 'state' ? stateDisplay(hidden.value) : hidden.value;
    const query = input.value === selectedLabel ? '' : normalizeSearch(input.value);
    const items = comboItems(combo).filter(item => normalizeSearch(item.label).includes(query));
    const message = comboMessage(combo);
    list.innerHTML = message ? `<div class="combobox-message">${message}</div>` : items.length ? items.map((item,index) => `<button type="button" id="${list.id}-option-${index}" role="option" data-combo-option data-value="${esc(item.value)}" data-label="${esc(item.label)}" aria-selected="${item.value === hidden.value}">${esc(item.label)}</button>`).join('') : '<div class="combobox-message">Nenhuma opção encontrada.</div>';
    const selectedIndex = message ? -1 : items.findIndex(item => item.value === hidden.value);
    combo.dataset.activeIndex = String(selectedIndex);
    if (selectedIndex >= 0) input.setAttribute('aria-activedescendant',`${list.id}-option-${selectedIndex}`);
    else input.removeAttribute('aria-activedescendant');
  }
  function closeCombobox(combo) {
    if (!combo) return;
    combo.classList.remove('open');
    combo.querySelector('[role="combobox"]')?.setAttribute('aria-expanded','false');
  }
  function closeOtherComboboxes(current) { document.querySelectorAll('.combobox.open').forEach(combo => { if (combo !== current) closeCombobox(combo); }); }
  function openCombobox(combo) {
    if (!combo || combo.querySelector('[role="combobox"]')?.disabled) return;
    closeOtherComboboxes(combo);
    combo.classList.add('open');
    combo.querySelector('[role="combobox"]').setAttribute('aria-expanded','true');
    renderComboOptions(combo);
    if (combo.dataset.combobox === 'city') loadCities(document.querySelector('#signup-form [name="state"]')?.value);
  }
  function setComboActive(combo,index) {
    const options = [...combo.querySelectorAll('[data-combo-option]')];
    if (!options.length) return;
    index = Math.max(0,Math.min(index,options.length - 1));
    options.forEach((option,i) => option.classList.toggle('active',i === index));
    combo.dataset.activeIndex = String(index);
    const input = combo.querySelector('[role="combobox"]');
    input.setAttribute('aria-activedescendant',options[index].id);
    options[index].scrollIntoView({ block:'nearest' });
  }
  function clearCitySelection() {
    const combo = document.querySelector('[data-combobox="city"]'); if (!combo) return;
    combo.querySelector('input[type="hidden"]').value = '';
    const input = combo.querySelector('[role="combobox"]'); input.value = ''; input.disabled = true; input.placeholder = 'Selecione o estado primeiro';
    combo.querySelector('[data-combo-toggle]').disabled = true;
    closeCombobox(combo); renderComboOptions(combo);
  }
  function selectComboOption(combo,value,label) {
    const type = combo.dataset.combobox, hidden = combo.querySelector('input[type="hidden"]'), changed = hidden.value !== value;
    hidden.value = value;
    combo.querySelector('[role="combobox"]').value = label;
    const error = document.querySelector(`[data-field-error="${type}"]`); if (error) error.textContent = '';
    closeCombobox(combo);
    if (type === 'state' && changed) {
      clearCitySelection();
      const cityCombo = document.querySelector('[data-combobox="city"]'), cityInput = cityCombo.querySelector('[role="combobox"]');
      cityInput.disabled = false; cityInput.placeholder = 'Carregando cidades...'; cityCombo.querySelector('[data-combo-toggle]').disabled = false;
      loadCities(value);
    }
    hidden.dispatchEvent(new Event('input',{ bubbles:true }));
  }
  async function loadCities(uf) {
    if (!uf) return;
    if (cityCache.has(uf)) {
      const cachedCombo = document.querySelector('[data-combobox="city"]');
      if (cachedCombo && document.querySelector('#signup-form [name="state"]')?.value === uf) { cachedCombo.querySelector('[role="combobox"]').placeholder = 'Digite ou selecione...'; renderComboOptions(cachedCombo); }
      return;
    }
    if (cityLoads.get(uf) === 'loading') return;
    cityLoads.set(uf,'loading');
    const combo = document.querySelector('[data-combobox="city"]'); if (combo) { combo.querySelector('[role="combobox"]').placeholder = 'Carregando cidades...'; renderComboOptions(combo); }
    try {
      const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`);
      if (!response.ok) throw new Error('Falha ao consultar cidades');
      const data = await response.json();
      const cities = [...new Set(data.map(city => city.nome).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
      if (!cities.length) throw new Error('Nenhuma cidade recebida');
      cityCache.set(uf,cities); cityLoads.set(uf,'ready');
      const currentUf = document.querySelector('#signup-form [name="state"]')?.value;
      if (currentUf !== uf) return;
      const cityCombo = document.querySelector('[data-combobox="city"]'), hidden = cityCombo?.querySelector('input[type="hidden"]');
      if (hidden?.value && !cities.includes(hidden.value)) { hidden.value = ''; cityCombo.querySelector('[role="combobox"]').value = ''; }
      if (cityCombo) { cityCombo.querySelector('[role="combobox"]').placeholder = 'Digite ou selecione...'; renderComboOptions(cityCombo); }
    } catch (_) {
      cityLoads.set(uf,'error');
      const currentUf = document.querySelector('#signup-form [name="state"]')?.value;
      const cityCombo = document.querySelector('[data-combobox="city"]');
      if (cityCombo && currentUf === uf) { cityCombo.querySelector('[role="combobox"]').placeholder = 'Pesquisar cidade...'; renderComboOptions(cityCombo); }
    }
  }
  function initSignupFields() {
    const phone = document.getElementById('signup-phone');
    if (phone) { phone.value = formatBrazilianPhone(phone.value); updateSignupPhoneValidity(phone); }
    document.querySelectorAll('#signup-form .combobox').forEach(renderComboOptions);
    const uf = document.querySelector('#signup-form [name="state"]')?.value; if (uf) loadCities(uf);
    const form = document.getElementById('signup-form');
    if (form) Object.entries(ui.signupErrors).forEach(([name,error]) => { if (name !== 'form') setFieldError(form,name,error); });
    updateSignupSubmitState();
  }
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
  const number = value => new Intl.NumberFormat('pt-BR').format(value);
  const vehicle = id => state.vehicles.find(v => v.id === Number(id));
  const client = id => state.clients.find(c => c.id === Number(id));
  const member = id => state.team.find(m => m.id === Number(id));
  const order = id => state.orders.find(o => o.id === Number(id));
  const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');
  const avatar = (name, color = '', big = false) => `<span class="avatar ${color} ${big ? 'big' : ''}" aria-hidden="true">${esc(initials(name))}</span>`;
  const badge = status => `<span class="badge" style="--status:${statuses[status].color}"><span class="dot"></span>${statuses[status].name}</span>`;
  const plate = value => `<span class="plate">${esc(value)}</span>`;
  const btn = (text, action, name = '', cls = '', extra = '') => `<button class="btn ${cls}" data-action="${action}" ${extra}>${name ? icon(name) : ''}${text}</button>`;
  const brand = () => '<a class="brand" href="#/dashboard" aria-label="GIRO — Visão geral"><img src="./mark.svg" alt=""><span>GIRO</span></a>';
  const search = (placeholder, id = 'page-search', value = '') => `<label class="search">${icon('search')}<input id="${id}" type="search" placeholder="${placeholder}" aria-label="${placeholder}" value="${esc(value)}"></label>`;
  const carArt = () => '<svg viewBox="0 0 360 150" fill="none" aria-hidden="true"><path d="m30 101 8-32 57-12 38-31h101l47 32 47 15 13 29-9 15H28z" fill="#252c33" stroke="currentColor" stroke-width="2"/><path d="m107 58 32-25h41v25zm83-25h40l38 25h-78z" fill="#10161c" stroke="currentColor" stroke-width="1.5"/><path d="M22 91h318M86 66h186M180 63v39M112 68h17M204 68h17" stroke="currentColor" opacity=".6"/><path d="m39 73 28-5-6 12H36m276-6 16 7 5 8h-18z" fill="#ebf2fa" opacity=".65"/><circle cx="87" cy="111" r="26" fill="#0b0e12" stroke="currentColor" stroke-width="2"/><circle cx="87" cy="111" r="16" stroke="#77818c" stroke-width="5"/><circle cx="280" cy="111" r="26" fill="#0b0e12" stroke="currentColor" stroke-width="2"/><circle cx="280" cy="111" r="16" stroke="#77818c" stroke-width="5"/><path d="M87 95v32m-16-16h32M280 95v32m-16-16h32" stroke="#77818c" stroke-width="3"/><path d="M124 112h119" stroke="#38bdf8" stroke-width="3"/></svg>';
  const route = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard').split('/');
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); return true; }
    catch (_) { toast('Não foi possível salvar no navegador. Libere espaço para preservar as alterações.', true); return false; }
  }
  function toast(text, error = false) {
    const el = document.createElement('div'); el.className = `toast ${error ? 'error' : ''}`;
    el.innerHTML = `${icon(error ? 'alert' : 'checkCircle')}<span>${esc(text)}</span>`;
    document.getElementById('toasts').append(el); setTimeout(() => el.remove(), 4500);
  }
  const navigate = path => { if (location.hash === `#/${path}`) render(); else location.hash = `/${path}`; };
  function openModal(title, body, footer = '') {
    restoreFocus = document.activeElement;
    modal.innerHTML = `<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Fechar">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;
    removeStaleOrderLinks(modal);
    if (!modal.open) modal.showModal();
  }
  function closeModal() { modal.close(); if (restoreFocus?.isConnected) restoreFocus.focus(); }
  function removeStaleOrderLinks(root) {
    root.querySelectorAll('[data-action="open-order"]').forEach(el => {
      if (!order(el.dataset.id)) (el.closest('.attention-bar, .notification-item') || el).remove();
    });
  }
  const empty = (text = 'Nenhum resultado encontrado', sub = 'Experimente ajustar a busca ou os filtros.') => `<div class="empty">${icon('search')}<strong>${text}</strong><p>${sub}</p></div>`;
  const metric = (label, value, foot, name, cls = '') => `<article class="metric ${cls}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(name)}</span></div><div class="metric-value ${String(value).includes('R$') ? 'currency' : ''}">${value}</div><div class="metric-foot">${foot}</div></article>`;
  const heading = (title, subtitle, actions = '', date = false) => `<div class="page-heading"><div>${date ? `<div class="date-label">${icon('calendar')}Terça-feira, 15 de setembro de 2026 <span class="muted">· Dia de demonstração</span></div>` : ''}<h1>${title}</h1><p class="subtext">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
  const navItems = [ ['dashboard','grid','Visão Geral'], ['servicos','wrench','Serviços'], ['ordens','clipboard','Ordens de Serviço'], ['clientes','users','Clientes'], ['veiculos','car','Veículos'], ['whatsapp','chat','WhatsApp'], ['historico','history','Histórico'], ['equipe','users','Equipe'], ['relatorios','chart','Relatórios'] ];
  function shell(content, page) {
    const navLink = ([path, name, label]) => `<a href="#/${path}" class="${page === path ? 'active' : ''}" ${page === path ? 'aria-current="page"' : ''} title="${label}">${icon(name)}<span class="nav-label">${label}</span>${path === 'ordens' ? `<span class="nav-count">${state.orders.filter(o => o.status < 6).length}</span>` : path === 'whatsapp' && unread() ? `<span class="nav-count">${unread()}</span>` : ''}</a>`;
    const label = [...navItems, ['configuracoes','','Configurações'], ['ajuda','','Ajuda'], ['patio','','Pátio da Oficina']].find(n => n[0] === page)?.[2] || 'Ordem de Serviço';
    return `<div class="${ui.collapsed ? 'sidebar-collapsed' : ''}" id="layout"><button class="menu-shade" data-action="menu" aria-label="Fechar menu"></button><aside class="sidebar"><div class="brand-area">${brand()}<button class="icon-btn" data-action="collapse" aria-label="Recolher ou expandir menu">${icon('left')}</button></div><div class="workspace-label">WORKSPACE DA OFICINA</div><nav class="nav" aria-label="Navegação principal">${navItems.map(navLink).join('')}</nav><div class="sidebar-bottom"><nav class="nav" aria-label="Suporte">${[['configuracoes','settings','Configurações'],['ajuda','help','Ajuda']].map(navLink).join('')}</nav><div class="workshop-card"><div class="workshop-name">${esc(state.settings.workshop)}</div><div class="row">${avatar(state.settings.name)}<div class="user-info grow"><strong>${esc(state.settings.name)}</strong><small>Administrador</small></div><button class="icon-btn" data-action="logout" aria-label="Sair da demonstração">${icon('logout')}</button></div></div></div></aside><div class="app-shell"><header class="topbar"><div class="row"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Abrir menu">${icon('menu')}</button><div class="breadcrumb">${icon('grid')}<span>Workspace</span>${icon('chevron')}<strong>${label}</strong></div></div><div class="top-actions"><span class="demo-tag">DEMONSTRAÇÃO</span><span class="live-status"><span class="dot"></span>Oficina em operação</span>${themeBtn()}<button class="icon-btn" data-action="global-search" aria-label="Buscar em todo o sistema">${icon('search')}</button><button class="icon-btn" data-action="notifications" aria-label="Notificações">${icon('bell')}${!state.readNotifications ? '<span class="notification-dot"></span>' : ''}</button>${avatar(state.settings.name)}</div></header><main id="main" tabindex="-1"><div class="page-enter">${content}</div><footer class="footer"><span>© 2026 GIRO · Sua oficina em movimento.</span><span>${icon('shield')}Ambiente de demonstração · Dados fictícios</span></footer></main></div><nav class="mobile-nav" aria-label="Acesso rápido">${[['servicos','wrench','Meu trabalho'],['ordens','clipboard','OS'],['veiculos','car','Veículos'],['whatsapp','chat','WhatsApp']].map(([path,name,text]) => `<a href="#/${path}" class="${page === path ? 'active' : ''}">${icon(name)}${text}</a>`).join('')}</nav></div>`;
  }
  const unread = () => state.conversations.reduce((sum,c) => sum + c.unread, 0);
  function filteredOrders() {
    const q = ui.query.toLocaleLowerCase('pt-BR');
    return state.orders.filter(o => {
      const v = vehicle(o.vehicle), c = client(v.client);
      return `${o.id} ${v.brand} ${v.model} ${v.plate} ${c.name} ${o.service}`.toLocaleLowerCase('pt-BR').includes(q)
        && (!ui.mechanic || o.mechanic === Number(ui.mechanic)) && (ui.status === '' || o.status === Number(ui.status)) && (!ui.priority || o.priority === ui.priority)
        && (ui.tab === 'Todas' || ui.tab === 'Abertas' && o.status < 6 || ui.tab === 'Aguardando cliente' && o.status === 2 || ui.tab === 'Em andamento' && [1,4,5].includes(o.status) || ui.tab === 'Finalizadas' && o.status === 6);
    });
  }
  function filters() {
    return `<div class="board-controls">${search('Buscar placa, cliente ou OS...', 'page-search', ui.query)}<div class="filter-group"><button class="filter-reset" data-action="reset-filters">Todos${ui.mechanic || ui.status !== '' || ui.priority ? ' · limpar filtros' : ''}</button><select id="mechanic-filter" aria-label="Filtrar por mecânico"><option value="">${'Mecânico'}</option>${state.team.filter(m => m.role === 'Mecânico').map(m => `<option value="${m.id}" ${ui.mechanic === String(m.id) ? 'selected' : ''}>${esc(m.name.split(' ')[0])}</option>`).join('')}</select><select id="status-filter" aria-label="Filtrar por status"><option value="">Status</option>${statuses.map((s,i) => `<option value="${i}" ${ui.status === String(i) ? 'selected' : ''}>${s.name}</option>`).join('')}</select><select id="priority-filter" aria-label="Filtrar por prioridade"><option value="">Prioridade</option>${['Normal','Alta','Urgente'].map(p => `<option ${ui.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>`;
  }
  function kanbanCard(o) {
    const v = vehicle(o.vehicle), c = client(v.client), m = member(o.mechanic);
    return `<button class="kanban-card" draggable="true" data-order="${o.id}" data-action="open-order" data-id="${o.id}" aria-label="OS ${o.id}, ${esc(v.brand)} ${esc(v.model)}, ${esc(v.plate)}, ${statuses[o.status].name}"><div class="card-top"><div><div class="car-brand">${esc(v.brand)}</div><div class="car-model">${esc(v.model.split(' ').slice(0,2).join(' '))}</div></div>${o.priority !== 'Normal' ? `<span class="priority-mark ${o.priority === 'Urgente' ? 'urgent' : ''}" title="Prioridade ${o.priority}">${icon('alert')}</span>` : ''}</div><div class="card-identification">${plate(v.plate)}<span class="os-number">#${o.id}</span></div><p class="card-service">${esc(o.service)}</p><div class="card-client">${icon('user')}${esc(c.name)}</div><div class="card-bottom"><span class="row">${avatar(m.name,m.color)}${esc(m.name.split(' ')[0])}</span><span class="row ${o.late ? 'red' : ''}">${icon(o.paused ? 'pause' : 'clock')}${o.paused ? 'Pausado' : esc(o.elapsed)}</span></div><div class="card-status">${badge(o.status)}${o.late ? '<span class="late-label">Atrasado</span>' : ''}</div></button>`;
  }
  function boardContent() {
    const orders = filteredOrders();
    if (ui.view === 'list') return ordersTable(orders);
    return `<div class="board-scroll"><div class="board">${statuses.map((s,i) => `<section class="kanban-column" data-drop-status="${i}" aria-label="${s.name}"><div class="column-heading" style="--status:${s.color}"><span class="dot"></span>${s.name}<span class="column-count">${orders.filter(o => o.status === i).length}</span><button data-action="new-order" data-status="${i}" aria-label="Nova OS em ${s.name}">+</button></div>${orders.filter(o => o.status === i).map(kanbanCard).join('')}<button class="column-add" data-action="new-order" data-status="${i}">+ Adicionar veículo</button></section>`).join('')}</div></div>${!orders.length ? empty() : ''}`;
  }
  function boardSection() {
    return `<section aria-labelledby="board-title"><div class="section-heading"><div><div class="section-title">${icon('board')}<h2 id="board-title">Pátio da Oficina</h2><span class="pill">${state.orders.length} veículos</span></div><p class="section-caption">Cada veículo no seu lugar. Cada etapa sob controle.</p></div><div class="view-switch" aria-label="Visualização"><button data-action="view-board" class="${ui.view === 'board' ? 'active' : ''}" aria-pressed="${ui.view === 'board'}">${icon('board')}<span>Kanban</span></button><button data-action="view-list" class="${ui.view === 'list' ? 'active' : ''}" aria-pressed="${ui.view === 'list'}">${icon('list')}<span>Lista</span></button></div></div>${filters()}<div id="results">${boardContent()}</div><div class="board-foot"><span class="row">${icon('grip')}Arraste para mover · Abra uma OS para alterar o status no celular ou teclado</span><span class="row"><span class="dot green"></span>Alterações salvas neste navegador</span></div></section>`;
  }
  function dashboard() {
    const count = s => state.orders.filter(o => o.status === s).length;
    const pending = state.orders.filter(o => o.status === 2).reduce((sum,o) => sum + o.value,0);
    return `${heading(`Boa tarde, ${esc(state.settings.name.split(' ')[0])}.`, 'Veja como está sua oficina hoje.', `<div class="top-search">${search('Buscar no GIRO...', 'global-search-input')}</div>${btn('Nova OS','new-order','plus','primary')}`, true)}<div class="metrics">${metric('VEÍCULOS NA OFICINA',state.orders.length,'<span class="green">+3</span> recebidos hoje','car')}${metric('EM SERVIÇO',count(4),`${new Set(state.orders.filter(o => o.status === 4).map(o => o.mechanic)).size} mecânicos trabalhando`,'wrench')}${metric('AGUARDANDO APROVAÇÃO',count(2),`<span style="color:#7dd3fc">${money(pending)}</span> pendentes`,'clock')}${metric('PRONTOS PARA ENTREGA',count(6),'<span class="green">●</span> Aguardando cliente','checkCircle')}${metric('FATURAMENTO DO MÊS',money(48750),`${icon('up')}<span class="green">12,4%</span> vs. mês anterior`,'wallet','revenue')}</div><div class="attention-bar">${icon('alert')}<strong>${state.orders.filter(o => o.late && o.status !== 6).length} veículo precisa de atenção</strong><span>· Peça pendente para o Civic #1029</span><button class="btn-link" data-action="open-order" data-id="1029">Ver pendência ${icon('arrow')}</button></div>${boardSection()}<div class="bottom-grid"><section class="panel"><div class="section-heading"><h2>Últimas movimentações</h2><a class="btn-link" href="#/historico" style="font-size:10px;min-height:20px">Ver histórico ${icon('arrow')}</a></div>${activities(3)}</section><section class="panel"><div class="section-heading"><h2>Equipe em ação</h2><a href="#/equipe" class="muted" style="font-size:10px">Ver equipe →</a></div>${state.team.filter(m => m.role === 'Mecânico').map(m => { const n = state.orders.filter(o => o.mechanic === m.id && o.status < 6).length; return `<div class="team-row">${avatar(m.name,m.color)}<div class="grow"><strong>${esc(m.name)}</strong><p>${esc(m.specialty)}</p></div><div><span class="badge" style="--status:#38bdf8">${n} serviços</span><div class="capacity"><span style="width:${Math.min(n * 25,100)}%"></span></div></div></div>`; }).join('')}</section><section class="panel"><div class="section-heading"><h2>Ritmo do dia</h2>${icon('up')}</div><div class="daily-target"><div class="ring"><div><strong>76<span style="font-size:13px">%</span></strong><small>da meta diária</small></div></div><div><strong>R$ 3.800</strong><p>de R$ 5.000 previstos</p><p class="green">No caminho certo ↗</p></div></div><div class="target-foot">Bom ritmo! Mais <strong class="orange">R$ 1.200</strong> para atingir a meta.<br>Referência ilustrativa do dia de demonstração.</div></section></div>`;
  }
  function activities(limit = 100) {
    const custom = state.orders.flatMap(o => (o.history || []).slice(1).map(h => ({ ...h, id:o.id, vehicle:o.vehicle }))).reverse();
    const defaults = [ { text:'Cliente aprovou o orçamento', id:1048, vehicle:1, date:'Há 12 min', type:'checkCircle' }, { text:'Veículo recebido para diagnóstico', id:1049, vehicle:3, date:'Há 35 min', type:'car' } ];
    return [...custom,...defaults].slice(0,limit).map((a,i) => `<a href="#/ordens/${a.id}" class="activity"><span class="activity-icon ${i === 1 ? 'amber' : i === 2 ? 'blue' : ''}">${icon(a.type || 'checkCircle')}</span><div><strong>${esc(a.text)}</strong><p>OS #${a.id} · ${esc(vehicle(a.vehicle).brand)} ${esc(vehicle(a.vehicle).model.split(' ')[0])} · ${esc(vehicle(a.vehicle).plate)}</p></div><time>${esc(a.date)}</time></a>`).join('');
  }
  function ordersTable(orders) {
    if (!orders.length) return empty();
    return `<div class="table-wrap"><table><thead><tr>${['OS','Veículo / Placa','Cliente','Serviço','Mecânico','Status','Valor','Entrada','Previsão'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${orders.map(o => { const v = vehicle(o.vehicle), c = client(v.client); return `<tr><td><a class="btn-link" href="#/ordens/${o.id}">#${o.id}</a></td><td><strong>${esc(v.brand)} ${esc(v.model.split(' ')[0])}</strong><small>${plate(v.plate)}</small></td><td>${esc(c.name)}</td><td><a href="#/ordens/${o.id}" title="Abrir ordem">${esc(o.service.length > 31 ? o.service.slice(0,31) + '…' : o.service)}</a></td><td><span class="row">${avatar(member(o.mechanic).name,member(o.mechanic).color)}${esc(member(o.mechanic).name.split(' ')[0])}</span></td><td>${badge(o.status)}</td><td><strong>${money(o.value)}</strong></td><td>${esc(o.entry)}</td><td class="${o.late ? 'red' : ''}">${esc(o.due)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function ordersPage() {
    return `${heading('Ordens de Serviço','Do primeiro diagnóstico à entrega das chaves.',btn('Exportar','export-orders','download','ghost optional') + btn('Nova Ordem','new-order','plus','primary'))}<section class="table-panel"><div class="table-toolbar"><div class="tabs">${['Todas','Abertas','Aguardando cliente','Em andamento','Finalizadas'].map(t => `<button class="tab ${ui.tab === t ? 'active' : ''}" data-action="order-tab" data-tab="${t}" aria-pressed="${ui.tab === t}">${t}</button>`).join('')}</div>${search('Buscar por OS, cliente ou placa','page-search',ui.query)}</div><div id="results">${ordersTable(filteredOrders())}</div><div class="table-footer"><span id="result-count">${filteredOrders().length} ordens encontradas</span><span>Todos os registros · Setembro 2026</span></div></section>`;
  }
  function detailPage(id) {
    const o = order(id); if (!o) return notFound();
    const v = vehicle(o.vehicle), c = client(v.client), m = member(o.mechanic);
    const steps = ['Entrada','Diagnóstico','Orçamento enviado','Cliente aprovou','Serviço iniciado','Finalização'];
    const reached = [0,1,2,3,4,5,5][o.status];
    return `${heading(`<span class="muted" style="font-weight:400">OS</span> #${o.id}`,`Entrada em ${esc(o.entry)}/2026 · Previsão: ${esc(o.due)}`,`<a class="btn ghost optional" href="#/ordens">${icon('left')}Voltar</a>${btn('WhatsApp','order-chat','chat','',`data-id="${o.id}"`)}${btn('Alterar status','change-status','board','primary',`data-id="${o.id}"`)}`)}<div class="detail-hero"><div>${badge(o.status)}<h2>${esc(v.brand)} ${esc(v.model)}</h2><div class="row">${plate(v.plate)}<span class="muted">${v.year}</span><span class="muted">${number(v.km)} km</span><span class="badge" style="--status:${o.priority === 'Urgente' ? '#f87171' : '#38bdf8'}">Prioridade ${o.priority.toLowerCase()}</span></div></div><div class="detail-car">${carArt()}</div><div><div class="eyebrow">Cliente</div><a href="#/clientes/${c.id}"><h3 style="margin:10px 0">${esc(c.name)}</h3></a><span class="muted">${esc(c.phone)}</span></div></div><div class="detail-grid"><div><section class="panel detail-section"><div class="timeline-horizontal">${steps.map((s,i) => `<div class="timeline-step ${i <= reached ? 'done' : ''}"><span class="step-dot">${i <= reached ? '✓' : i + 1}</span>${s}</div>`).join('')}</div><div class="form-grid"><div><div class="eyebrow">Problema relatado</div><p style="margin-top:12px">${esc(o.issue)}</p></div><div><div class="between"><div class="eyebrow">Diagnóstico</div><button class="btn-link" data-action="diagnosis" data-id="${o.id}" style="font-size:11px;min-height:20px">Editar</button></div><p style="margin-top:12px">${esc(o.diagnosis || 'Aguardando avaliação do responsável.')}</p></div></div></section><section class="panel detail-section"><div class="section-heading"><h3>Serviços</h3><button class="btn-link" data-action="add-service" data-id="${o.id}">${icon('plus')}Adicionar</button></div><div class="key-value"><strong>${esc(o.service)}</strong><span>${money(o.value - (o.extraServices || []).reduce((s,x) => s+x.value,0))}</span></div>${(o.extraServices || []).map(s => `<div class="key-value"><strong>${esc(s.name)}</strong><span>${money(s.value)}</span></div>`).join('')}<p style="font-size:11px;margin-top:12px">Valores do orçamento demonstrativo, incluindo peças e mão de obra.</p></section><section class="panel detail-section"><div class="section-heading"><h3>Peças e materiais</h3>${btn('Adicionar peça','add-part','plus','ghost',`data-id="${o.id}"`)}</div>${o.parts?.length ? o.parts.map(p => `<div class="key-value"><strong>${esc(p.name)}</strong><span>${p.qty} un. · Incluído no orçamento</span></div>`).join('') : `<p>${o.id === 1048 ? '1 jogo de pastilhas dianteiras · 1 frasco de fluido DOT 4<br><span class="green">Disponíveis no estoque · Incluídos no orçamento</span>' : o.status === 3 ? '<span style="color:#e7bd74">Compressor do ar-condicionado · Aguardando fornecedor</span>' : 'Nenhuma peça adicional registrada.'}</p>`}</section><section class="panel detail-section"><div class="section-heading"><h3>Fotos do veículo</h3><span class="muted">${o.photos.length} fotos</span></div><div class="photo-grid">${o.photos.map((p,i) => `<a href="${p}" target="_blank" rel="noopener" aria-label="Abrir foto ${i+1}"><img src="${p}" alt="Registro do veículo, foto ${i+1}"></a>`).join('')}<button class="photo-add" data-action="photo" data-id="${o.id}">${icon('camera')}Adicionar foto</button></div></section><section class="panel detail-section"><div class="section-heading"><h3>Observações</h3><button class="btn-link" data-action="note" data-id="${o.id}">${icon('plus')}Adicionar</button></div>${o.notes.length ? o.notes.map(n => `<div class="activity"><span class="activity-icon amber">${icon(n.problem ? 'alert' : 'note')}</span><div><strong>${esc(n.text)}</strong><p>${esc(n.date)} · ${esc(n.author)}</p></div></div>`).join('') : '<p>Nenhuma observação adicional. Registre aqui informações importantes para a equipe.</p>'}</section><section class="panel detail-section"><div class="section-heading"><h3>Histórico do veículo</h3><a class="btn-link" href="#/veiculos/${v.id}">Ver prontuário ${icon('arrow')}</a></div>${vehicleTimeline(v)}</section></div><aside class="stack"><section class="panel"><h3>Responsável</h3><div class="row" style="margin:20px 0">${avatar(m.name,m.color,true)}<div><strong>${esc(m.name)}</strong><p class="subtext" style="font-size:11px">${esc(m.specialty)}</p></div></div><div class="key-value"><span>Tempo registrado</span><strong>${esc(o.elapsed)}</strong></div><div class="key-value"><span>Situação</span><strong>${o.paused ? 'Pausado' : statuses[o.status].name}</strong></div><a class="btn ghost" href="#/servicos/${o.id}" style="width:100%;margin-top:12px">${icon('wrench')}Abrir modo mecânico</a></section><section class="panel"><h3>Resumo do orçamento</h3><div style="margin-top:15px"><div class="key-value"><span>Serviços e materiais</span><strong>${money(o.value)}</strong></div><div class="key-value"><span>Desconto</span><strong>R$ 0</strong></div><div class="key-value total"><span>Total</span><strong>${money(o.value)}</strong></div></div><div class="divider"></div>${btn(o.status === 6 ? 'OS finalizada' : 'Finalizar OS','finish-order','checkCircle',o.status === 6 ? 'success' : 'primary',`data-id="${o.id}" style="width:100%" ${o.status === 6 ? 'disabled' : ''}`)}<p class="subtext" style="font-size:11px">Confira os serviços e faça a inspeção final antes de liberar o veículo.</p></section><section class="panel"><h3>Movimentações desta OS</h3><div style="margin-top:20px" class="timeline-list">${[...o.history].reverse().map(h => `<div class="timeline-item"><time>${esc(h.date)}</time><h4>${esc(h.text)}</h4></div>`).join('')}</div></section></aside></div>`;
  }
  function vehicleTimeline(v) {
    return `<div class="timeline-list">${[{ date:'10/09/2026', text:'Troca de óleo e filtro', km: Math.round(v.km*.95) },{ date:'04/06/2026',text:'Substituição das pastilhas traseiras',km:Math.round(v.km*.87) },{ date:'12/02/2026',text:'Revisão preventiva',km:Math.round(v.km*.77) }].map(h => `<div class="timeline-item"><time>${h.date}</time><h4>${h.text}</h4><p>${number(h.km)} km · Serviço concluído</p></div>`).join('')}</div>`;
  }
  function workCard(o) {
    const v = vehicle(o.vehicle);
    return `<article class="work-card"><div class="between"><span class="eyebrow">OS #${o.id}</span>${badge(o.status)}</div><h2>${esc(v.brand)} ${esc(v.model.split(' ')[0])} ${v.year}</h2><div class="between">${plate(v.plate)}<span class="row muted">${icon('clock')}${o.paused ? 'Pausado' : esc(o.elapsed)}</span></div><div class="work-service"><span class="eyebrow">Serviço</span><h3>${esc(o.service)}</h3><span class="eyebrow">Observação do cliente</span><p class="subtext">${esc(o.issue)}</p></div><div class="work-actions">${o.status < 4 ? btn('Iniciar serviço','start-work','play','primary large full',`data-id="${o.id}"`) : o.status === 4 ? `${btn(o.paused ? 'Retomar' : 'Pausar','pause-work',o.paused ? 'play' : 'pause','large',`data-id="${o.id}"`)}${btn('Finalizar','finish-work','check','primary large',`data-id="${o.id}"`)}` : `<div class="btn success full large">${icon('checkCircle')}${o.status === 5 ? 'Aguardando inspeção final' : 'Veículo pronto'}</div>`}</div><div class="quick-actions">${btn('Foto','photo','camera','ghost',`data-id="${o.id}"`)}${btn('Observação','note','note','ghost',`data-id="${o.id}"`)}${btn('Problema','problem','alert','ghost',`data-id="${o.id}"`)}</div><a class="btn-link" href="#/ordens/${o.id}" style="font-size:12px;margin-top:14px">Ver detalhes completos ${icon('arrow')}</a></article>`;
  }
  function workPage(id) {
    const items = id ? state.orders.filter(o => o.id === Number(id)) : filteredOrders().filter(o => o.status < 6);
    return `${heading('Meu trabalho','Serviços atribuídos, prazos e ações da oficina.',`<a class="btn ghost" href="#/patio">${icon('board')}Ver pátio</a>`)}${id ? '' : filters()}<div id="results" class="work-grid">${items.length ? items.map(workCard).join('') : empty('Nenhum serviço nesta seleção','Selecione outro mecânico ou limpe os filtros.')}</div>`;
  }
  function clientsTable() {
    const items = state.clients.filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(ui.query.toLowerCase()));
    return items.length ? `<div class="table-wrap"><table><thead><tr>${['Cliente','WhatsApp','Veículos','Última visita','Total de serviços',''].map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${items.map(c => { const vs = state.vehicles.filter(v => v.client === c.id); const os = state.orders.filter(o => vs.some(v => v.id === o.vehicle)); return `<tr><td><a href="#/clientes/${c.id}" class="row">${avatar(c.name)}<span><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></span></a></td><td>${esc(c.phone)}</td><td>${vs.length} ${vs.length === 1 ? 'veículo' : 'veículos'}</td><td>${os.length ? '15/09/2026' : '—'}</td><td>${os.length + (vs.length ? 3 : 0)}</td><td><a href="#/clientes/${c.id}" class="btn-link">Ver cliente ${icon('chevron')}</a></td></tr>`; }).join('')}</tbody></table></div>` : empty();
  }
  function clientsPage(id) {
    if (id) {
      const c = client(id); if (!c) return notFound(); const vs = state.vehicles.filter(v => v.client === c.id);
      return `${heading(esc(c.name),'Dados, veículos e histórico do cliente.',btn('Enviar WhatsApp','client-chat','chat','primary',`data-id="${c.id}"`))}<div class="detail-hero"><div class="row">${avatar(c.name,'',true)}<div><h3>${esc(c.name)}</h3><p class="subtext">${esc(c.email)}</p></div></div><div><div class="eyebrow">WhatsApp / Telefone</div><p style="margin-top:10px">${esc(c.phone)}</p></div><a href="#/clientes" class="btn ghost">Voltar aos clientes</a></div><div class="section-heading"><h2>Veículos de ${esc(c.name.split(' ')[0])}</h2><span class="pill">${vs.length} cadastrados</span></div><div class="entity-grid">${vs.map(vehicleCard).join('') || empty('Nenhum veículo cadastrado','Cadastre um veículo para iniciar o histórico.')}</div><section class="panel" style="margin-top:24px"><h2 style="margin-bottom:22px">Histórico de ordens de serviço</h2>${ordersTable(state.orders.filter(o => vs.some(v => v.id === o.vehicle)))}</section>`;
    }
    return `${heading('Clientes','Contatos, veículos e histórico de atendimento.',btn('Novo cliente','new-client','plus','primary'))}<div class="stats-three">${metric('CLIENTES ATIVOS',state.clients.length,'Relacionamentos em dia','users')}${metric('NOVOS ESTE MÊS',state.clients.length,'Novos clientes em setembro','user')}${metric('CLIENTES RECORRENTES',state.clients.length,'Voltaram a cuidar do veículo','history')}</div><section class="table-panel"><div class="table-toolbar"><h2>Base de clientes</h2>${search('Buscar nome ou WhatsApp','page-search',ui.query)}</div><div id="results">${clientsTable()}</div></section>`;
  }
  function vehicleCard(v) {
    return `<a class="vehicle-card" href="#/veiculos/${v.id}"><div class="vehicle-visual">${carArt()}</div><div class="between"><span class="eyebrow">${esc(v.brand)}</span>${plate(v.plate)}</div><h3>${esc(v.model)}</h3><div class="vehicle-meta"><span>${v.year} · ${number(v.km)} km</span>${icon('chevron')}</div><p class="subtext" style="font-size:12px">${icon('user')} ${esc(client(v.client).name)}</p><div class="vehicle-next"><span class="muted">Último serviço</span> · Troca de óleo, 10/09<br><span class="orange">Próxima manutenção</span><br>${esc(v.next)}</div></a>`;
  }
  function vehiclesResults() {
    const vs = state.vehicles.filter(v => `${v.brand} ${v.model} ${v.plate} ${client(v.client).name}`.toLowerCase().includes(ui.query.toLowerCase()));
    return vs.map(vehicleCard).join('') || empty();
  }
  function vehiclesPage(id) {
    if (id) {
      const v = vehicle(id); if (!v) return notFound(); const c = client(v.client);
      return `${heading('Prontuário do veículo','Dados e manutenções registradas para este veículo.',btn('Nova OS','new-order','plus','primary',`data-vehicle="${v.id}"`))}<div class="detail-hero"><div><span class="eyebrow">${esc(v.brand)} · ${v.year}</span><h2>${esc(v.brand)} ${esc(v.model)}</h2><div class="row">${plate(v.plate)}<span>${number(v.km)} km</span></div></div><div class="detail-car">${carArt()}</div><a href="#/clientes/${c.id}"><span class="eyebrow">Proprietário</span><h3 style="margin:12px 0">${esc(c.name)}</h3><span class="muted">${esc(c.phone)}</span></a></div><div class="detail-grid"><section class="panel"><h2 style="margin-bottom:28px">Histórico de manutenções</h2>${vehicleTimeline(v)}<div class="divider"></div><h3 style="margin-bottom:18px">Ordens de serviço vinculadas</h3>${ordersTable(state.orders.filter(o => o.vehicle === v.id))}</section><aside class="stack"><section class="panel"><span class="activity-icon amber">${icon('wrench')}</span><h3 style="margin:18px 0">Próxima manutenção</h3><p class="subtext">${esc(v.next)}</p>${btn('Atualizar quilometragem','mileage','car','ghost',`data-id="${v.id}" style="margin-top:20px;width:100%"`)}</section><section class="panel"><h3>Dados do veículo</h3><div class="key-value"><span>Ano</span><strong>${v.year}</strong></div><div class="key-value"><span>Placa</span><strong>${esc(v.plate)}</strong></div><div class="key-value"><span>Quilometragem</span><strong>${number(v.km)} km</strong></div></section></aside></div>`;
    }
    return `${heading('Veículos','Cadastro e histórico de manutenção da oficina.',btn('Cadastrar veículo','new-vehicle','plus','primary'))}<div class="section-heading"><span class="muted">${state.vehicles.length} veículos cadastrados</span>${search('Buscar placa, modelo ou cliente','page-search',ui.query)}</div><div id="results" class="entity-grid">${vehiclesResults()}</div>`;
  }
  function chatContext(c) {
    const person = client(c.client), v = vehicle(c.vehicle);
    return `<div class="context-block"><span class="eyebrow">Cliente</span><h4>${esc(person.name)}</h4><span class="muted" style="font-size:11px">${esc(person.phone)}</span></div><div class="context-block"><span class="eyebrow">Veículo</span><h4>${esc(v.brand)} ${esc(v.model.split(' ')[0])} ${v.year}</h4>${plate(v.plate)}</div><div class="bot-collected"><span class="eyebrow">${icon('bot')} Bot coletou</span><p><span class="muted">Problema</span><br>${esc(c.problem)}</p><p><span class="muted">Disponibilidade</span><br>${esc(c.availability)}</p></div>${btn('Criar Ordem de Serviço','new-order','plus','primary',`data-vehicle="${v.id}" data-issue="${esc(c.problem)}"`)}<p class="integration-note">Conversa demonstrativa. As mensagens ficam neste navegador; não são enviadas ao WhatsApp real.</p>`;
  }
  function conversationList() {
    return state.conversations.filter(c => client(c.client).name.toLowerCase().includes(ui.query.toLowerCase())).map(c => { const p = client(c.client), v = vehicle(c.vehicle); return `<button class="conversation ${ui.chat === c.id ? 'selected' : ''}" data-action="select-chat" data-id="${c.id}">${avatar(p.name,c.id === 2 ? 'purple' : '')}<div class="grow"><strong>${esc(p.name)}</strong><p>${esc(v.model.split(' ')[0])} · ${esc(v.plate)}</p><p class="preview">${esc(c.messages.at(-1)?.text || 'Nova conversa')}</p></div>${c.unread ? `<span class="unread">${c.unread}</span>` : ''}</button>`; }).join('') || empty('Nenhuma conversa','Tente outro nome.');
  }
  function whatsappPage() {
    const c = state.conversations.find(c => c.id === ui.chat) || state.conversations[0], p = client(c.client);
    return `${heading('Central WhatsApp','Conversas e dados do atendimento em um só lugar.',`<span class="badge" style="--status:#4ade80">${icon('chat')}Canal demonstrativo</span>`)}<div class="chat-layout ${ui.chatList ? 'show-list' : ''}"><aside class="conversation-list"><div class="conversation-title"><div class="between"><h3>Conversas</h3><span class="pill">${state.conversations.length}</span></div>${search('Buscar conversa','chat-search',ui.query)}</div><div id="conversations">${conversationList()}</div></aside><section class="chat-main" aria-label="Conversa com ${esc(p.name)}"><div class="chat-header between"><div class="row"><button class="icon-btn chat-back" data-action="chat-list" style="display:none" aria-label="Voltar às conversas">${icon('left')}</button>${avatar(p.name)}<div><strong>${esc(p.name)}</strong><p>Atendimento com Marcos Ribeiro</p></div></div><button class="icon-btn chat-context-toggle" data-action="chat-context" aria-label="Ver dados coletados e criar OS" style="display:none">${icon('clipboard')}</button></div><div class="chat-messages" id="chat-messages"><span class="chat-date">15 de setembro de 2026 · Demonstração</span>${c.messages.map(m => `<div class="message ${m.who}"><div class="message-role">${m.who === 'bot' ? 'BOT · GIRO ASSISTENTE' : m.who === 'attendant' ? 'ATENDENTE · MARCOS' : 'CLIENTE · '+esc(p.name.split(' ')[0]).toUpperCase()}</div><div class="message-bubble">${esc(m.text)}</div><time>${esc(m.time)}${m.who === 'attendant' ? ' · ✓✓' : ''}</time></div>`).join('')}</div><form class="chat-compose" id="message-form"><input name="message" placeholder="Escreva sua mensagem..." aria-label="Mensagem" required maxlength="2000" autocomplete="off"><button class="btn primary" type="submit" aria-label="Enviar mensagem demonstrativa">${icon('send')}</button></form></section><aside class="chat-context">${chatContext(c)}</aside></div>`;
  }
  function teamPage() {
    return `${heading('Equipe','Responsáveis e distribuição dos serviços.',btn('Adicionar pessoa','new-member','plus','primary'))}<div class="stats-three">${metric('PESSOAS NA EQUIPE',state.team.length,'Cadastradas na oficina','users')}${metric('MECÂNICOS',state.team.filter(m => m.role === 'Mecânico').length,'Disponíveis na operação','wrench')}${metric('SERVIÇOS EM EXECUÇÃO',state.orders.filter(o => o.status === 4).length,'Distribuídos entre a equipe','clipboard')}</div><div class="entity-grid">${state.team.map(m => { const assigned = state.orders.filter(o => o.mechanic === m.id && o.status < 6); return `<article class="panel"><div class="between">${avatar(m.name,m.color,true)}<span class="badge" style="--status:#4ade80">Ativo</span></div><h3 style="margin-top:20px">${esc(m.name)}</h3><p class="subtext">${esc(m.role)}</p><p class="subtext" style="font-size:12px">${esc(m.specialty)}</p><div class="divider"></div><div class="between"><span class="muted" style="font-size:12px">${m.role === 'Mecânico' ? 'Serviços atribuídos' : 'Área de atuação'}</span><strong>${m.role === 'Mecânico' ? assigned.length : m.role === 'Atendente' ? 'Atendimento' : 'Gestão'}</strong></div>${m.role === 'Mecânico' ? btn('Ver serviços','member-work','wrench','ghost',`data-id="${m.id}" style="width:100%;margin-top:20px"`) : `<a class="btn ghost" href="#/${m.role === 'Atendente' ? 'whatsapp' : 'relatorios'}" style="width:100%;margin-top:20px">${icon('arrow')}Abrir área</a>`}</article>`; }).join('')}</div>`;
  }
  function revenueChart() {
    const values = ui.report === 7 ? [2200,3400,2900,4100,3200,4900,3800] : [1200,2600,1800,3100,2000,3800,2900,3400,2000,2800,3600,4100,2300,3100,2800,3300,4000,3500,4200,2700,3700,4600,3300,3900,4300,3700,4600,4100,4900,3800];
    const points = values.map((v,i) => `${40+i*540/(values.length-1)},${210-v/5000*180}`).join(' ');
    return `<svg class="chart" viewBox="0 0 610 240" role="img" aria-label="Faturamento ilustrativo dos últimos ${ui.report} dias, entre R$ ${Math.min(...values)} e R$ ${Math.max(...values)}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${cssVar('--orange-hover','#38bdf8')}" stop-opacity=".18"/><stop offset="1" stop-color="${cssVar('--orange-hover','#38bdf8')}" stop-opacity="0"/></linearGradient></defs>${[0,1,2,3,4].map(i => `<line class="chart-grid" x1="40" y1="${210-i*45}" x2="590" y2="${210-i*45}"/><text x="0" y="${214-i*45}">${i ? `${String(i*1.25).replace('.',',')}k` : '0'}</text>`).join('')}<polygon points="40,210 ${points} 580,210" fill="url(#chart-fill)"/><polyline points="${points}" stroke="${cssVar('--accent','#7dd3fc')}" stroke-width="2.5" fill="none" stroke-linejoin="round"/><circle cx="580" cy="${210-values.at(-1)/5000*180}" r="5" fill="${cssVar('--accent','#7dd3fc')}" stroke="${cssVar('--surface','#151b23')}" stroke-width="3"/></svg><div class="chart-labels">${(ui.report === 7 ? ['09 set','10 set','11 set','12 set','13 set','14 set','15 set'] : ['17 ago','22 ago','27 ago','01 set','06 set','11 set','15 set']).map(t => `<span>${t}</span>`).join('')}</div>`;
  }
  function reportsPage() {
    return `${heading('Visão de gestão','Os números que mostram o ritmo da sua oficina.',btn('Exportar relatório','export-report','download','ghost'))}<div class="report-metrics">${metric('FATURAMENTO DO MÊS','R$ 48.750','<span class="green">↗ 12,4%</span> vs. mês anterior','wallet','revenue')}${metric('TICKET MÉDIO','R$ 812','<span class="green">↗ 8,2%</span> vs. mês anterior','chart')}${metric('OS ABERTAS',state.orders.filter(o => o.status < 6).length,'Em acompanhamento no pátio','clipboard')}${metric('OS CONCLUÍDAS NO MÊS',60,'<span class="green">+8</span> vs. mês anterior','checkCircle')}${metric('TEMPO MÉDIO','2h 45m','<span class="green">↓ 18min</span> por serviço','clock')}${metric('APROVAÇÃO','87%','Orçamentos aprovados','check')}${metric('VEÍCULOS ATENDIDOS',54,'No mês de setembro','car')}${metric('PRODUTIVIDADE','82%','Horas produtivas / disponíveis','wrench')}</div><div class="reports-grid"><section class="panel"><div class="section-heading"><div><h2>Faturamento</h2><p class="section-caption">Evolução diária da oficina</p></div><div class="view-switch">${[7,30].map(n => `<button data-action="report-period" data-days="${n}" class="${ui.report === n ? 'active' : ''}">${n} dias</button>`).join('')}</div></div><div class="chart-legend"><span class="dot orange"></span>Receita por dia · Dados ilustrativos</div>${revenueChart()}</section><section class="panel"><div class="section-heading"><h2>OS por status</h2><span class="pill">Agora</span></div>${statuses.map((s,i) => { const n = state.orders.filter(o => o.status === i).length; return `<div class="status-row"><span class="label">${s.name}</span><div class="status-bar"><span style="width:${n/state.orders.length*100}%;background:${s.color}"></span></div><strong>${n}</strong></div>`; }).join('')}</section><section class="panel"><div class="section-heading"><h2>Serviços mais realizados</h2><span class="muted" style="font-size:11px">Setembro · Ilustrativo</span></div>${[['Troca de óleo e filtros',24,'R$ 9.360'],['Revisão preventiva',16,'R$ 18.400'],['Freios e suspensão',12,'R$ 15.360'],['Alinhamento e balanceamento',8,'R$ 1.760']].map(([s,n,v],i) => `<div class="service-rank"><span class="rank-number">0${i+1}</span><div><strong>${s}</strong><p class="subtext" style="font-size:11px">${n} serviços realizados</p></div><strong>${v}</strong></div>`).join('')}</section><section class="panel"><span class="activity-icon">${icon('up')}</span><h2 style="margin-top:20px">Uma oficina mais produtiva.</h2><p class="subtext" style="margin-top:15px">O tempo médio de execução caiu 18 minutos em relação ao mês anterior. Continue acompanhando os gargalos de aprovação e peças.</p><div class="divider"></div><a href="#/patio" class="btn ghost">${icon('board')}Acompanhar operação</a><p class="integration-note">Indicadores mensais e tendências são demonstrativos. A distribuição por status acompanha as alterações feitas nas OS.</p></section></div>`;
  }
  function settingsPage() {
    let content;
    if (ui.settings === 'Oficina') content = `<h2>Dados da oficina</h2><p class="subtext">A identidade da sua operação dentro do GIRO.</p><div class="divider"></div><form id="settings-form"><div class="form-grid"><label class="field full">Nome da oficina<input name="workshop" required maxlength="70" value="${esc(state.settings.workshop)}"></label><label class="field">Responsável<input name="name" required maxlength="60" value="${esc(state.settings.name)}"></label><label class="field">E-mail<input name="email" type="email" required value="${esc(state.settings.email)}"></label><label class="field">Telefone<input name="phone" type="tel" required value="${esc(state.settings.phone)}"></label><label class="field full">Endereço<input name="address" required value="${esc(state.settings.address)}"></label></div><div class="divider"></div><button type="submit" class="btn primary">${icon('check')}Salvar alterações</button></form>`;
    else if (ui.settings === 'Notificações') content = `<h2>Notificações da operação</h2><p class="subtext">Receba apenas o que precisa da sua atenção.</p><label class="switch-label"><div><strong>Central de notificações</strong><p>Aprovações, peças pendentes, entregas e novos atendimentos.</p></div><input type="checkbox" id="notification-setting" ${state.settings.notifications ? 'checked' : ''}></label><p class="integration-note">Preferência local. Notificações push e envio por e-mail dependem de integração com o backend.</p>`;
    else if (ui.settings === 'Integrações') content = `<h2>Integrações</h2><div class="divider"></div><div class="between"><div class="row">${icon('chat')}<h3>WhatsApp Business</h3></div><span class="badge" style="--status:#38bdf8">Modo demonstração</span></div><p class="subtext" style="margin:20px 0">A central está disponível para simular atendimento e criação de OS. Para mensagens reais, será necessário conectar a API oficial do WhatsApp Business no backend.</p><a href="#/whatsapp" class="btn primary">Abrir central ${icon('arrow')}</a>`;
    else content = `<h2>Ambiente de demonstração</h2><p class="subtext">Suas alterações são armazenadas somente neste navegador, sem sincronização com outros dispositivos.</p><div class="divider"></div><div class="key-value"><span>Versão</span><strong>GIRO Frontend · 1.0</strong></div><div class="key-value"><span>Ordens cadastradas</span><strong>${state.orders.length}</strong></div><div class="key-value"><span>Armazenamento</span><strong>LocalStorage</strong></div><div class="divider"></div>${btn('Restaurar dados de demonstração','reset-demo','history','danger')}<p class="integration-note">Esta ação apaga as alterações locais e restaura os exemplos originais.</p>`;
    return `${heading('Configurações','Ajuste o GIRO ao jeito da sua oficina.')}<div class="settings-layout"><nav class="settings-tabs" aria-label="Seções de configurações">${['Oficina','Notificações','Integrações','Demonstração'].map(t => `<button class="tab ${ui.settings === t ? 'active' : ''}" data-action="settings-tab" data-tab="${t}">${t}</button>`).join('')}</nav><section class="panel">${content}</section></div>`;
  }
  function historyPage() {
    return `${heading('Histórico da oficina','Uma trilha clara de tudo o que acontece na operação.')}<div class="detail-grid"><section class="panel"><h2 style="margin-bottom:15px">Movimentações recentes</h2>${activities()}</section><aside><section class="panel"><h3>Rastreabilidade, sem complicação.</h3><p class="subtext">Mudanças de status, diagnósticos e observações ficam registrados na ordem de serviço. Clique em uma movimentação para ver o contexto completo.</p></section></aside></div>`;
  }
  function helpPage() {
    return `${heading('Como podemos ajudar?','Respostas rápidas para manter a oficina em movimento.')}<div class="help-grid">${[['Como movimentar um veículo no pátio?','No computador, arraste o card até a coluna desejada. Em celulares, tablets ou usando teclado, abra a OS e toque em “Alterar status”. A alteração aparece também na tabela de ordens.'],['Como funciona o modo mecânico?','Abra Serviços, escolha o mecânico e toque em Iniciar serviço. Use Pausar, Retomar e Finalizar durante o trabalho. A finalização do mecânico envia o carro à inspeção final; a liberação para entrega acontece em Finalizar OS.'],['Como criar uma OS a partir do WhatsApp?','Selecione a conversa e use “Criar Ordem de Serviço” no painel de dados do cliente. No celular, abra o ícone de prancheta no topo da conversa. O veículo e o problema já vêm preenchidos.'],['Onde ficam os dados desta demonstração?','As alterações ficam no armazenamento local deste navegador. Não há autenticação de produção, comunicação real com o WhatsApp ou sincronização com servidor. Você pode restaurar os exemplos em Configurações → Demonstração.'],['Como adicionar fotos?','Na ordem ou no modo mecânico, toque em Foto. Selecione uma imagem JPG, PNG ou WebP com até 2 MB. O GIRO reduz o tamanho da imagem para armazená-la localmente.'],['Como acessar a apresentação?','Use Visão Geral para acompanhar o pátio, Relatórios para a gestão e Serviços para a experiência do mecânico. A tela de entrada está disponível pelo botão Sair no rodapé do menu.']].map(([q,a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;
  }
  function notFound() { return `${heading('Não encontramos esta página.','O registro pode não existir neste ambiente de demonstração.')}<a class="btn primary" href="#/dashboard">Voltar à visão geral ${icon('arrow')}</a>`; }
  function authPage(page) {
    const signup = page === 'cadastro', recovery = page === 'recuperar';
    let form;
    if (signup) {
      const d = ui.signupData, errors = ui.signupErrors;
      const focusOptions = ['Organizar ordens de serviço','Acompanhar a equipe','Melhorar o atendimento'];
      const sections = [ `<label class="field">Nome completo<input name="name" autocomplete="name" maxlength="80" value="${esc(d.name || '')}" placeholder="Seu nome">${fieldErrorMarkup('name',errors.name)}</label><label class="field">WhatsApp<input id="signup-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="15" aria-describedby="signup-phone-error" value="${esc(formatBrazilianPhone(d.phone || ''))}" placeholder="(51) 99999-9999"><span class="field-error" id="signup-phone-error" data-field-error="phone" aria-live="polite">${esc(errors.phone || '')}</span></label>`, `<label class="field">Nome da oficina<input name="workshop" maxlength="70" value="${esc(d.workshop || '')}" placeholder="Como sua oficina se chama?">${fieldErrorMarkup('workshop',errors.workshop)}</label>${signupLocationFields(d)}`, `<label class="field">E-mail<input name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" value="${esc(d.email || '')}" placeholder="voce@oficina.com.br">${fieldErrorMarkup('email',errors.email)}</label><label class="field">Crie uma senha<input name="password" type="password" autocomplete="new-password" maxlength="128" value="${esc(d.password || '')}" placeholder="No mínimo 8 caracteres">${fieldErrorMarkup('password',errors.password)}</label><label class="field">Confirmar senha<input name="passwordConfirmation" type="password" autocomplete="new-password" maxlength="128" value="${esc(d.passwordConfirmation || '')}" placeholder="Digite a senha novamente">${fieldErrorMarkup('passwordConfirmation',errors.passwordConfirmation)}</label><p class="integration-note">Use de 8 a 128 caracteres. A senha é protegida pelo backend e nunca é salva no navegador.</p>`, `<div class="auth-notice"><strong>Tudo pronto para dar o próximo GIRO.</strong><p style="margin-top:12px">${esc(d.workshop)}<br>${esc(d.name)} · ${esc(d.email)}<br>${esc(d.city || '')}${d.state ? ` - ${esc(d.state)}` : ''}</p></div><label class="field">Seu foco inicial<select name="focus">${focusOptions.map(option => `<option ${d.focus === option ? 'selected' : ''}>${option}</option>`).join('')}</select>${fieldErrorMarkup('focus',errors.focus)}</label><label class="checkbox-row"><input name="terms" type="checkbox" ${d.terms ? 'checked' : ''}>Confirmo os dados e aceito criar esta conta.</label>${fieldErrorMarkup('terms',errors.terms)}` ];
      const submitLabel = ui.signup === 1 ? 'Confirmar' : ui.signup === 4 ? 'Criar minha conta' : 'Continuar';
      form = `<h2>Sua oficina no GIRO.</h2><p class="subtext">Poucos passos para começar a organizar.</p><div class="signup-progress">${['Responsável','Oficina','Conta','Concluir'].map((t,i) => `<span class="signup-step ${i+1 <= ui.signup ? 'active' : ''}"><b>${i+1 < ui.signup ? '✓' : i+1}</b>${t}</span>`).join('')}</div><form id="signup-form" novalidate>${sections[ui.signup-1]}<p class="auth-form-error" data-form-error aria-live="polite">${esc(errors.form || '')}</p><button class="btn primary auth-submit" data-auth-submit type="submit" disabled>${submitLabel}${icon('arrow')}</button></form>${ui.signup > 1 ? btn('Voltar','signup-back','left','ghost', 'style="width:100%;margin-top:10px"') : ''}<p class="auth-foot">Já conhece o GIRO? <a href="#/login" class="orange">Entrar</a></p>`;
    } else if (recovery) form = `<h2>Recuperar acesso</h2><p class="subtext">Informe seu e-mail para simular a recuperação.</p><form id="recovery-form"><label class="field">E-mail<input type="email" name="email" autocomplete="email" required placeholder="voce@oficina.com.br"></label><button class="btn primary" type="submit">Continuar ${icon('arrow')}</button></form><div class="auth-notice">Este frontend não envia e-mails. Em produção, a recuperação será conectada ao serviço de autenticação.</div><a class="btn ghost" href="#/login" style="width:100%">Voltar para entrar</a>`;
    else form = `<span class="eyebrow orange">Bem-vindo de volta</span><h2 style="margin-top:15px">Entre no ritmo.</h2><p class="subtext">Sua oficina está esperando por você.</p><form id="login-form" novalidate><label class="field">E-mail<input type="email" name="email" inputmode="email" autocomplete="username" maxlength="254" placeholder="voce@oficina.com.br" value="carlos@example.com">${fieldErrorMarkup('email',ui.loginErrors.email)}</label><label class="field">Senha<span class="password-field"><input type="password" name="password" id="password" autocomplete="current-password" maxlength="128" placeholder="Sua senha" value="girodemo"><button type="button" class="icon-btn" data-action="toggle-password" aria-label="Mostrar senha">${icon('eye')}</button></span>${fieldErrorMarkup('password',ui.loginErrors.password)}</label><p class="auth-form-error" data-form-error aria-live="polite">${esc(ui.loginErrors.form || '')}</p><div class="between"><label class="checkbox-row"><input name="remember" type="checkbox">Lembrar meu e-mail</label><a href="#/recuperar" class="orange" style="font-size:12px">Esqueci minha senha</a></div><button class="btn primary large auth-submit" data-auth-submit type="submit">Entrar ${icon('arrow')}</button></form><div class="auth-notice"><strong>Acesso de demonstração</strong><br>Use carlos@example.com e a senha girodemo.</div><p class="auth-foot">Não possui uma oficina cadastrada?<br><a href="#/cadastro" class="orange">Criar conta ${icon('arrow')}</a></p>`;
    return `<div class="auth">${themeBtn()}<section class="auth-story">${brand()}<div class="auth-copy"><span class="eyebrow">Gestão feita para quem entende de carros</span><h1>Sua oficina<br>em <span>movimento.</span></h1><p>Controle serviços, veículos e clientes sem papelada.</p><div class="auth-car">${carArt()}</div><div class="row" style="font-size:11px;color:#acb7c2">${icon('checkCircle')}Mais controle. Menos retrabalho.</div></div><div class="auth-story-footer"><span>© 2026 GIRO</span><span>Tecnologia que acompanha seu ritmo.</span></div></section><main id="main" class="auth-content"><div class="auth-form">${form}</div></main></div>`;
  }
  async function verifySession() {
    if (ui.authChecking) return;
    ui.authChecking = true;
    try {
      const response = await fetch('/api/auth/session'), data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sessão inválida.');
      ui.session = data.user; ui.authChecked = true; render();
    } catch (_) {
      ui.session = null; ui.authChecked = false; navigate('login');
    } finally { ui.authChecking = false; }
  }
  async function logout() {
    try { await fetch('/api/auth/logout',{ method:'POST' }); } catch (_) {}
    ui.session = null; ui.authChecked = false; navigate('login');
  }
  function render() {
    const [page,id] = route();
    document.title = `GIRO | ${[...navItems,['login','','Entrar'],['cadastro','','Criar conta']].find(n => n[0] === page)?.[2] || 'Sua oficina em movimento'}`;
    if (['login','cadastro','recuperar'].includes(page)) { app.innerHTML = authPage(page); if (page === 'login') { try { const remembered = localStorage.getItem('giro-email'); if (remembered) { app.querySelector('[name="email"]').value = remembered; app.querySelector('[name="remember"]').checked = true; } } catch (_) {} const form = document.getElementById('login-form'); if (form) Object.entries(ui.loginErrors).forEach(([name,error]) => { if (name !== 'form') setFieldError(form,name,error); }); } else if (page === 'cadastro') initSignupFields(); return; }
    if (!ui.authChecked) { app.innerHTML = '<div class="boot"><img src="./mark.svg" width="48" height="48" alt="GIRO"><p>Verificando acesso...</p><div class="skeleton"></div></div>'; verifySession(); return; }
    const pages = { dashboard, patio: () => `${heading('Pátio da Oficina','O fluxo completo da operação, em tempo real na demonstração.',btn('Nova OS','new-order','plus','primary'))}${boardSection()}`, ordens: () => id ? detailPage(id) : ordersPage(), servicos: () => workPage(id), clientes: () => clientsPage(id), veiculos: () => vehiclesPage(id), whatsapp: whatsappPage, equipe: teamPage, relatorios: reportsPage, configuracoes: settingsPage, historico: historyPage, ajuda: helpPage };
    app.innerHTML = shell((pages[page] || notFound)(), page);
    removeStaleOrderLinks(app);
    if (page === 'dashboard') {
      const received = app.querySelector('.metric:first-child .metric-foot .green');
      if (received) received.textContent = `+${state.orders.length}`;
    }
    if (page === 'whatsapp') { const messages = document.getElementById('chat-messages'); if (messages) messages.scrollTop = messages.scrollHeight; }
  }
  function updateResults() {
    const [page] = route(), el = document.getElementById('results'); if (!el) return;
    if (['dashboard','patio'].includes(page)) el.innerHTML = boardContent();
    else if (page === 'ordens') { el.innerHTML = ordersTable(filteredOrders()); document.getElementById('result-count').textContent = `${filteredOrders().length} ordens encontradas`; }
    else if (page === 'servicos') el.innerHTML = filteredOrders().filter(o => o.status < 6).map(workCard).join('') || empty();
    else if (page === 'clientes') el.innerHTML = clientsTable();
    else if (page === 'veiculos') el.innerHTML = vehiclesResults();
  }
  function log(o,text) { o.history.push({ text, date: new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) }); }
  function setStatus(o,status) { if (o.status === status) return; o.status = status; o.paused = false; if (status === 6) o.late = false; log(o,`Status alterado para ${statuses[status].name}`); save(); render(); toast(`OS #${o.id} → ${statuses[status].name}`); }
  function statusModal(o) { openModal(`Alterar status · OS #${o.id}`,`<form id="status-form" data-id="${o.id}"><label class="field">Etapa da oficina<select name="status">${statuses.map((s,i) => `<option value="${i}" ${o.status === i ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label><p class="subtext">Para liberar como Pronto, confira os serviços e a inspeção final.</p></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary" form="status-form" type="submit">Salvar status</button>`); }
  function newOrderModal(dataset = {}) {
    openModal('Nova Ordem de Serviço',`<form id="new-order-form"><div class="form-grid"><label class="field full">Veículo e cliente<select name="vehicle" required>${state.vehicles.map(v => `<option value="${v.id}" ${Number(dataset.vehicle) === v.id ? 'selected' : ''}>${esc(v.brand)} ${esc(v.model.split(' ')[0])} · ${esc(v.plate)} · ${esc(client(v.client).name)}</option>`).join('')}</select><small>Para um veículo novo, cadastre-o primeiro em Veículos.</small></label><label class="field full">Serviço solicitado<input name="service" required minlength="3" maxlength="100" placeholder="Ex.: revisão do sistema de freios"></label><label class="field full">Problema relatado<textarea name="issue" required maxlength="1500" placeholder="O que o cliente relatou?">${esc(dataset.issue || '')}</textarea></label><label class="field">Responsável<select name="mechanic">${state.team.filter(m => m.role === 'Mecânico').map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label><label class="field">Prioridade<select name="priority"><option>Normal</option><option>Alta</option><option>Urgente</option></select></label><label class="field">Valor estimado (R$)<input name="value" type="number" min="0" max="1000000" step="0.01" value="0" required></label><label class="field">Previsão<input name="due" type="datetime-local" required value="2026-09-16T17:00"></label><label class="field full">Status inicial<select name="status">${statuses.map((s,i) => `<option value="${i}" ${Number(dataset.status || 0) === i ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label></div></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary" type="submit" form="new-order-form">${icon('plus')}Criar OS</button>`);
  }
  function noteModal(o,problem = false) { openModal(problem ? 'Registrar problema encontrado' : 'Adicionar observação',`<form id="note-form" data-id="${o.id}" data-problem="${problem}"><label class="field">${problem ? 'O que você encontrou?' : 'Observação para a equipe'}<textarea name="text" required maxlength="1500" placeholder="Descreva de forma objetiva..." autofocus></textarea></label></form>`,`${btn('Cancelar','close-modal','','ghost')}<button type="submit" form="note-form" class="btn primary">Salvar registro</button>`); }
  function confirmFinish(o, mechanic = false) {
    openModal(mechanic ? 'Finalizar o serviço?' : 'Liberar veículo para entrega?',`<p>${mechanic ? 'O trabalho será enviado para Finalização, onde a equipe poderá realizar a inspeção.' : 'Confirme que todos os serviços foram concluídos e a inspeção final foi realizada. O veículo será movido para Pronto.'}</p><p style="margin-top:15px"><strong>OS #${o.id} · ${esc(vehicle(o.vehicle).plate)}</strong></p>`,`${btn('Voltar','close-modal','','ghost')}${btn(mechanic ? 'Concluir serviço' : 'Confirmar finalização','confirm-finish','check','primary',`data-id="${o.id}" data-status="${mechanic ? 5 : 6}"`)}`);
  }
  function ensureChat(clientId) {
    let c = state.conversations.find(c => c.client === clientId);
    if (!c) { const v = state.vehicles.find(v => v.client === clientId); if (!v) { toast('Cadastre um veículo para iniciar o atendimento.',true); return; } c = { id:Math.max(0,...state.conversations.map(c => c.id))+1, client:clientId,vehicle:v.id,unread:0,availability:'A combinar',problem:'Atendimento da oficina',messages:[] }; state.conversations.push(c); save(); }
    ui.chat = c.id; ui.chatList = false; closeModal(); navigate('whatsapp');
  }
  function photoUpload(o) {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.setAttribute('capture','environment');
    input.addEventListener('change',() => {
      const file = input.files[0]; if (!file) return;
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2*1024*1024) { toast('Selecione JPG, PNG ou WebP com até 2 MB.',true); return; }
      const url = URL.createObjectURL(file), image = new Image();
      image.onload = () => { const scale = Math.min(1,1000/image.width,1000/image.height), canvas = document.createElement('canvas'); canvas.width = image.width*scale; canvas.height = image.height*scale; canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); o.photos.push(canvas.toDataURL('image/jpeg',.72)); URL.revokeObjectURL(url); log(o,'Foto adicionada ao registro do veículo'); if (save()) { render(); toast('Foto adicionada à ordem de serviço.'); } };
      image.onerror = () => { URL.revokeObjectURL(url); toast('Não foi possível ler esta imagem.',true); }; image.src = url;
    }); input.click();
  }
  function exportCSV(rows, filename) {
    const csv = '\uFEFF' + rows.map(row => row.map(v => { let text = String(v ?? ''); if (/^[=+@-]/.test(text)) text = "'"+text; return '"'+text.replace(/"/g,'""')+'"'; }).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); toast('Exportação preparada.');
  }
  function authFieldName(target) {
    return target.name || target.closest?.('.combobox')?.dataset.combobox || '';
  }
  function handleAuthFieldChange(target,showError = false) {
    const signupForm = target.closest?.('#signup-form');
    if (signupForm) {
      const name = authFieldName(target);
      if (signupFieldsByStep[ui.signup].includes(name)) {
        const errorElement = signupForm.querySelector(`[data-field-error="${name}"]`), shouldShow = showError || Boolean(errorElement?.textContent);
        delete ui.signupErrors[name]; delete ui.signupErrors.form;
        if (shouldShow) setFieldError(signupForm,name,signupFieldError(signupForm,name));
        const formError = signupForm.querySelector('[data-form-error]'); if (formError) formError.textContent = '';
      }
      updateSignupSubmitState();
      return;
    }
    const loginForm = target.closest?.('#login-form');
    if (loginForm && ['email','password'].includes(target.name)) {
      delete ui.loginErrors[target.name]; delete ui.loginErrors.form;
      setFieldError(loginForm,target.name,showError ? target.name === 'email' ? target.value.trim() ? isValidEmail(target.value) ? '' : 'E-mail inválido.' : 'Informe seu e-mail.' : target.value ? '' : 'Informe sua senha.' : '');
      const formError = loginForm.querySelector('[data-form-error]'); if (formError) formError.textContent = '';
    }
  }
  document.addEventListener('click',e => {
    const clickedCombo = e.target.closest('.combobox');
    if (!clickedCombo) closeOtherComboboxes(null);
    const comboInput = e.target.closest('[role="combobox"]');
    if (comboInput) { openCombobox(comboInput.closest('.combobox')); return; }
    const comboOption = e.target.closest('[data-combo-option]');
    if (comboOption) { selectComboOption(comboOption.closest('.combobox'),comboOption.dataset.value,comboOption.dataset.label); return; }
    const comboToggle = e.target.closest('[data-combo-toggle]');
    if (comboToggle) { const combo = comboToggle.closest('.combobox'), wasOpen = combo.classList.contains('open'); if (wasOpen) closeCombobox(combo); else { combo.querySelector('[role="combobox"]').focus(); openCombobox(combo); } return; }
    const photo = e.target.closest('.photo-grid a');
    if (photo) {
      e.preventDefault();
      openModal('Foto do veículo',`<img src="${photo.querySelector('img').src}" alt="Registro fotográfico do veículo" style="display:block;width:100%;max-height:65vh;object-fit:contain">`);
      return;
    }
    const target = e.target.closest('[data-action]'); if (!target) return;
    const { action,id } = target.dataset, o = id ? order(id) : null;
    switch (action) {
      case 'theme': applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); break;
      case 'menu': document.getElementById('layout')?.classList.toggle('menu-visible'); break;
      case 'collapse': if (innerWidth <= 760) document.getElementById('layout')?.classList.remove('menu-visible'); else { ui.collapsed = !ui.collapsed; render(); } break;
      case 'close-modal': closeModal(); break;
      case 'logout': logout(); break;
      case 'new-order': newOrderModal(target.dataset); break;
      case 'open-order': closeModal(); navigate(`ordens/${id}`); break;
      case 'view-board': ui.view = 'board'; render(); break;
      case 'view-list': ui.view = 'list'; render(); break;
      case 'reset-filters': ui.query = ui.mechanic = ui.status = ui.priority = ''; ui.tab = 'Todas'; render(); break;
      case 'order-tab': ui.tab = target.dataset.tab; render(); break;
      case 'change-status': statusModal(o); break;
      case 'finish-order': confirmFinish(o); break;
      case 'finish-work': confirmFinish(o,true); break;
      case 'confirm-finish': closeModal(); setStatus(o,Number(target.dataset.status)); break;
      case 'start-work': if ([2,3].includes(o.status)) openModal('Iniciar este serviço?',`<p>Esta OS está em <strong>${statuses[o.status].name}</strong>. Confirme que a aprovação do cliente e as peças necessárias já estão disponíveis.</p>`,`${btn('Voltar','close-modal','','ghost')}${btn('Confirmar e iniciar','confirm-finish','play','primary',`data-id="${o.id}" data-status="4"`)}`); else setStatus(o,4); break;
      case 'pause-work': o.paused = !o.paused; log(o,o.paused ? 'Serviço pausado' : 'Serviço retomado'); save(); render(); toast(o.paused ? 'Serviço pausado.' : 'Serviço retomado.'); break;
      case 'note': noteModal(o); break;
      case 'problem': noteModal(o,true); break;
      case 'photo': photoUpload(o); break;
      case 'diagnosis': openModal('Diagnóstico do veículo',`<form id="diagnosis-form" data-id="${id}"><label class="field">Avaliação técnica<textarea name="diagnosis" required maxlength="2000">${esc(o.diagnosis || '')}</textarea></label></form>`,`<button class="btn primary" type="submit" form="diagnosis-form">Salvar diagnóstico</button>`); break;
      case 'add-service': openModal('Adicionar serviço ao orçamento',`<form id="service-form" data-id="${id}" class="form-grid"><label class="field full">Descrição<input name="name" required maxlength="120"></label><label class="field full">Valor (R$)<input name="value" required type="number" min="0" max="100000" step="0.01"></label></form>`,`<button type="submit" form="service-form" class="btn primary">Adicionar serviço</button>`); break;
      case 'add-part': openModal('Adicionar peça ou material',`<form id="part-form" data-id="${id}" class="form-grid"><label class="field full">Peça<input name="name" required maxlength="100"></label><label class="field full">Quantidade<input name="qty" type="number" min="1" max="999" step="1" required value="1"></label><p class="muted">Peça incluída no valor atual do orçamento. Para custos adicionais, adicione um serviço com o valor correspondente.</p></form>`,`<button type="submit" form="part-form" class="btn primary">Registrar peça</button>`); break;
      case 'order-chat': ensureChat(client(vehicle(o.vehicle).client).id); break;
      case 'client-chat': ensureChat(Number(id)); break;
      case 'select-chat': ui.chat = Number(id); ui.chatList = false; state.conversations.find(c => c.id === ui.chat).unread = 0; save(); render(); break;
      case 'chat-list': ui.chatList = true; render(); break;
      case 'chat-context': openModal('Dados do atendimento',`<div class="chat-context" style="display:block;border:0;padding:0">${chatContext(state.conversations.find(c => c.id === ui.chat))}</div>`); break;
      case 'notifications': openModal('Central de notificações',state.settings.notifications ? `${!state.readNotifications ? '<p class="subtext">O que merece sua atenção agora.</p>' : '<p class="subtext">Todas as notificações foram lidas.</p>'}${[{title:'Cliente aprovou orçamento',text:'OS #1048 · Corolla ABC1D23',id:1048,icon:'checkCircle'},{title:'Peça ainda não chegou',text:'OS #1029 · Civic DEF2A19',id:1029,icon:'box'},{title:'Veículo pronto há 2h',text:'OS #1035 · Hilux GHI5J72',id:1035,icon:'car'}].map(n => `<button class="notification-item" data-action="open-order" data-id="${n.id}"><span class="activity-icon amber">${icon(n.icon)}</span><div><strong>${n.title}</strong><p>${n.text}</p><small>Exemplo do dia de demonstração</small></div></button>`).join('')}<a href="#/whatsapp" class="notification-item" data-action="close-modal"><span class="activity-icon blue">${icon('chat')}</span><div><strong>Novo atendimento via WhatsApp</strong><p>Ana Souza · Chevrolet Onix</p></div></a>` : '<p>As notificações estão desativadas. Você pode ativá-las em Configurações.</p>',btn('Marcar todas como lidas','read-notifications','check','primary')); break;
      case 'read-notifications': state.readNotifications = true; save(); closeModal(); render(); toast('Notificações marcadas como lidas.'); break;
      case 'global-search': openModal('Buscar no GIRO',`${search('Placa, cliente ou número da OS','modal-search')}<div id="global-results" style="margin-top:18px">${empty('Encontre o que precisa','Digite para buscar nas ordens de serviço.')}</div>`); setTimeout(() => document.getElementById('modal-search')?.focus(),50); break;
      case 'new-client': openModal('Novo cliente',`<form id="client-form" class="form-grid"><label class="field full">Nome completo<input name="name" required minlength="3" maxlength="80"></label><label class="field">WhatsApp<input name="phone" type="tel" required pattern="[0-9()+ \\-]{10,20}" placeholder="(51) 99999-9999"></label><label class="field">E-mail<input name="email" type="email" required></label></form>`,`<button class="btn primary" type="submit" form="client-form">Cadastrar cliente</button>`); break;
      case 'new-vehicle': openModal('Cadastrar veículo',`<form id="vehicle-form" class="form-grid"><label class="field">Marca<input name="brand" required maxlength="30" placeholder="Toyota"></label><label class="field">Modelo<input name="model" required maxlength="60" placeholder="Corolla XEi 2.0"></label><label class="field">Placa Mercosul<input name="plate" required pattern="[A-Za-z]{3}[0-9][A-Za-z][0-9]{2}" maxlength="7" placeholder="ABC1D23" style="text-transform:uppercase"></label><label class="field">Ano<input name="year" type="number" min="1950" max="2028" required value="2021"></label><label class="field">Quilometragem<input name="km" type="number" min="0" max="2000000" required value="0"></label><label class="field">Cliente<select name="client">${state.clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label class="field full">Próxima manutenção<input name="next" required placeholder="Revisão · 90.000 km"></label></form>`,`<button class="btn primary" type="submit" form="vehicle-form">Cadastrar veículo</button>`); break;
      case 'mileage': openModal('Atualizar quilometragem',`<form id="mileage-form" data-id="${id}"><label class="field">Quilometragem atual<input name="km" type="number" required min="${vehicle(id).km}" max="2000000" value="${vehicle(id).km}"></label></form>`,`<button type="submit" form="mileage-form" class="btn primary">Atualizar</button>`); break;
      case 'new-member': openModal('Adicionar pessoa à equipe',`<form id="member-form" class="form-grid"><label class="field full">Nome completo<input name="name" required minlength="3" maxlength="80"></label><label class="field">Cargo<select name="role"><option>Mecânico</option><option>Atendente</option><option>Administrador</option></select></label><label class="field">Especialidade<input name="specialty" required maxlength="80"></label></form><p class="integration-note">Cadastro local para distribuição de serviços. Convites e permissões reais exigem autenticação no backend.</p>`,`<button class="btn primary" type="submit" form="member-form">Adicionar pessoa</button>`); break;
      case 'member-work': ui.mechanic = id; ui.tab = 'Todas'; ui.query = ui.status = ui.priority = ''; navigate(`servicos?m=${id}`); break;
      case 'report-period': ui.report = Number(target.dataset.days); render(); break;
      case 'settings-tab': ui.settings = target.dataset.tab; render(); break;
      case 'reset-demo': openModal('Restaurar demonstração?', '<p>As ordens, clientes, veículos, fotos, mensagens e configurações criados neste navegador serão removidos. Esta ação não pode ser desfeita.</p>', `${btn('Manter meus dados','close-modal','','ghost')}${btn('Restaurar dados','confirm-reset','history','danger')}`); break;
      case 'confirm-reset': state = seed(); save(); ui.chat = 1; closeModal(); render(); toast('Demonstração restaurada.'); break;
      case 'toggle-password': { const input = document.getElementById('password'); input.type = input.type === 'password' ? 'text' : 'password'; target.setAttribute('aria-label',input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha'); break; }
      case 'signup-back': ui.signup--; render(); break;
      case 'export-orders': exportCSV([['OS','Veículo','Placa','Cliente','Serviço','Mecânico','Status','Valor','Entrada','Previsão'],...filteredOrders().map(o => { const v = vehicle(o.vehicle); return [o.id,`${v.brand} ${v.model}`,v.plate,client(v.client).name,o.service,member(o.mechanic).name,statuses[o.status].name,o.value,o.entry,o.due]; })],'giro-ordens.csv'); break;
      case 'export-report': exportCSV([['GIRO — Relatório demonstrativo','Setembro 2026'],['Indicador','Valor'],['Faturamento',48750],['Ticket médio',812],['OS abertas',state.orders.filter(o => o.status < 6).length],['OS concluídas no mês',60],['Aprovação','87%'],...statuses.map((s,i) => [s.name,state.orders.filter(o => o.status === i).length])],'giro-relatorio-demo.csv'); break;
    }
  });
  document.addEventListener('input',e => {
    if (e.target.id === 'signup-phone') {
      const digitsBeforeCaret = phoneDigits(e.target.value.slice(0,e.target.selectionStart)).length;
      e.target.value = formatBrazilianPhone(e.target.value);
      const caret = phoneCaretPosition(e.target.value,digitsBeforeCaret); e.target.setSelectionRange(caret,caret);
      updateSignupPhoneValidity(e.target,true);
    }
    const combo = e.target.closest?.('.combobox');
    if (combo && e.target.matches('[role="combobox"]')) {
      const type = combo.dataset.combobox, hidden = combo.querySelector('input[type="hidden"]');
      if (hidden.value) {
        hidden.value = '';
        if (type === 'state') clearCitySelection();
      }
      const error = document.querySelector(`[data-field-error="${type}"]`); if (error) error.textContent = '';
      openCombobox(combo); renderComboOptions(combo);
    }
    handleAuthFieldChange(e.target);
    if (e.target.id === 'page-search') { ui.query = e.target.value; updateResults(); }
    if (e.target.id === 'chat-search') { ui.query = e.target.value; document.getElementById('conversations').innerHTML = conversationList(); }
    if (e.target.id === 'global-search-input') { const q = e.target.value; document.querySelector('[data-action="global-search"]').click(); const input = document.getElementById('modal-search'); input.value = q; input.dispatchEvent(new Event('input',{bubbles:true})); }
    if (e.target.id === 'modal-search') { const q = e.target.value.trim().toLowerCase(); const matches = q ? state.orders.filter(o => { const v = vehicle(o.vehicle); return `${o.id} ${v.plate} ${v.brand} ${v.model} ${client(v.client).name}`.toLowerCase().includes(q); }) : []; document.getElementById('global-results').innerHTML = matches.length ? matches.map(o => `<button class="notification-item" data-action="open-order" data-id="${o.id}">${icon('car')}<span><strong>#${o.id} · ${esc(vehicle(o.vehicle).brand)} ${esc(vehicle(o.vehicle).model)}</strong><p>${esc(vehicle(o.vehicle).plate)} · ${esc(client(vehicle(o.vehicle).client).name)}</p></span></button>`).join('') : empty(); }
  });
  document.addEventListener('change',e => {
    const map = { 'mechanic-filter':'mechanic', 'status-filter':'status', 'priority-filter':'priority' };
    if (map[e.target.id]) { ui[map[e.target.id]] = e.target.value; updateResults(); }
    if (e.target.id === 'notification-setting') { state.settings.notifications = e.target.checked; save(); toast('Preferência salva.'); }
    handleAuthFieldChange(e.target);
  });
  document.addEventListener('focusout',e => { if (e.target.closest?.('#signup-form,#login-form')) handleAuthFieldChange(e.target,true); });
  document.addEventListener('submit',async e => {
    const form = e.target; if (!form.id) return; e.preventDefault();
    if (ui.submitting && ['login-form','signup-form'].includes(form.id)) return;
    const d = Object.fromEntries(new FormData(form)); for (const key of Object.keys(d)) if (typeof d[key] === 'string' && !['password','passwordConfirmation'].includes(key)) d[key] = d[key].trim();
    if (!['login-form','signup-form'].includes(form.id) && [...form.querySelectorAll('[required]')].some(field => typeof field.value === 'string' && !field.value.trim())) { toast('Preencha os campos obrigatórios.',true); return; }
    const o = form.dataset.id ? order(form.dataset.id) : null;
    switch (form.id) {
      case 'login-form': {
        const values = validateLogin(form,true); if (!values.valid) return;
        setAuthSubmitting(form,true,'Entrando...');
        try {
          const { response,data } = await authRequest('/api/auth/login',{ email:values.email,password:values.password });
          if (!response.ok) {
            if (data.fields) Object.entries(data.fields).forEach(([name,error]) => setFieldError(form,name,error));
            ui.loginErrors.form = data.error || 'Não foi possível entrar.';
            form.querySelector('[data-form-error]').textContent = ui.loginErrors.form;
            if (response.status === 401) ['email','password'].forEach(name => fieldControl(form,name)?.setAttribute('aria-invalid','true'));
            setAuthSubmitting(form,false); return;
          }
          try { if (d.remember) localStorage.setItem('giro-email',values.email); else localStorage.removeItem('giro-email'); } catch (_) {}
          ui.loginErrors = {}; ui.session = data.user; ui.authChecked = true; setAuthSubmitting(form,false); navigate('dashboard'); toast('Login realizado com sucesso.');
        } catch (_) {
          ui.loginErrors.form = 'Não foi possível conectar ao servidor. Tente novamente.'; form.querySelector('[data-form-error]').textContent = ui.loginErrors.form; setAuthSubmitting(form,false);
        }
        return;
      }
      case 'recovery-form': openModal('Recuperação demonstrativa',`<p>Em produção, as instruções seriam enviadas para <strong>${esc(d.email)}</strong>. Nenhum e-mail foi enviado neste ambiente.</p>`,btn('Entendi','close-modal','','primary')); return;
      case 'signup-form': {
        if (!validateSignupStep(form,true)) return;
        const stepValues = ui.signup === 1 ? { name:normalizeSpaces(d.name),phone:formatBrazilianPhone(d.phone) }
          : ui.signup === 2 ? { workshop:normalizeSpaces(d.workshop),state:d.state,city:d.city,address:`${d.city}, ${d.state}` }
          : ui.signup === 3 ? { email:d.email.toLowerCase(),password:d.password,passwordConfirmation:d.passwordConfirmation }
          : { focus:d.focus,terms:Boolean(d.terms) };
        Object.assign(ui.signupData,stepValues); ui.signupErrors = {};
        if (ui.signup < 4) { ui.signup++; render(); return; }

        setAuthSubmitting(form,true,'Criando conta...');
        try {
          const { response,data } = await authRequest('/api/auth/register',ui.signupData);
          if (!response.ok) {
            ui.submitting = false; ui.signupErrors = { ...(data.fields || {}),form:data.error || 'Não foi possível criar a conta.' };
            if (data.fields) {
              const fieldSteps = { name:1,phone:1,workshop:2,state:2,city:2,email:3,password:3,passwordConfirmation:3,focus:4,terms:4 };
              ui.signup = Math.min(...Object.keys(data.fields).map(name => fieldSteps[name] || 4)); render();
            } else { form.querySelector('[data-form-error]').textContent = ui.signupErrors.form; setAuthSubmitting(form,false); }
            return;
          }
          const { password,passwordConfirmation,terms,...settings } = ui.signupData;
          Object.assign(state.settings,settings); save(); ui.session = data.user; ui.authChecked = true; ui.submitting = false; ui.signup = 1; ui.signupData = {}; ui.signupErrors = {}; navigate('dashboard'); toast('Conta criada com sucesso.');
        } catch (_) {
          ui.signupErrors.form = 'Não foi possível conectar ao servidor. Tente novamente.'; form.querySelector('[data-form-error]').textContent = ui.signupErrors.form; setAuthSubmitting(form,false);
        }
        return;
      }
      case 'new-order-form': { const v = vehicle(d.vehicle); if (!v) return; const due = new Date(d.due); const newId = Math.max(...state.orders.map(o => o.id))+1; const now = new Date(); state.orders.unshift({ id:newId, vehicle:Number(d.vehicle),service:d.service,issue:d.issue,mechanic:Number(d.mechanic),priority:d.priority,value:Number(d.value),status:Number(d.status),due:due.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),entry:now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),elapsed:'Agora',notes:[],photos:[],extraServices:[],history:[{text:'Ordem de serviço criada',date:now.toLocaleString('pt-BR')}],paused:false,late:false }); save(); closeModal(); navigate(`ordens/${newId}`); toast(`OS #${newId} criada com sucesso.`); return; }
      case 'status-form': closeModal(); if (Number(d.status) === 6 && o.status !== 6) confirmFinish(o); else setStatus(o,Number(d.status)); return;
      case 'note-form': o.notes.push({text:d.text,problem:form.dataset.problem === 'true',date:new Date().toLocaleString('pt-BR'),author:state.settings.name}); log(o,form.dataset.problem === 'true' ? 'Problema encontrado registrado' : 'Observação adicionada'); break;
      case 'diagnosis-form': o.diagnosis = d.diagnosis; log(o,'Diagnóstico atualizado'); break;
      case 'service-form': o.extraServices.push({name:d.name,value:Number(d.value)}); o.value += Number(d.value); log(o,`Serviço adicionado: ${d.name}`); break;
      case 'part-form': (o.parts ||= []).push({name:d.name,qty:Number(d.qty)}); log(o,`Peça registrada: ${d.name}`); break;
      case 'message-form': { const c = state.conversations.find(c => c.id === ui.chat); c.messages.push({who:'attendant',text:d.message,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}); save(); render(); document.querySelector('[name="message"]')?.focus(); return; }
      case 'client-form': state.clients.push({id:Math.max(...state.clients.map(c => c.id))+1,...d}); break;
      case 'vehicle-form': if (state.vehicles.some(v => v.plate === d.plate.toUpperCase())) { toast('Esta placa já está cadastrada.',true); return; } state.vehicles.push({...d,id:Math.max(...state.vehicles.map(v => v.id))+1,plate:d.plate.toUpperCase(),year:Number(d.year),km:Number(d.km),client:Number(d.client)}); break;
      case 'mileage-form': vehicle(form.dataset.id).km = Number(d.km); break;
      case 'member-form': state.team.push({...d,id:Math.max(...state.team.map(m => m.id))+1,color:'blue'}); break;
      case 'settings-form': Object.assign(state.settings,d); break;
      default: return;
    }
    const persisted = save(); closeModal(); render(); if (persisted) toast('Alterações salvas com sucesso.');
  });
  let draggedId = null;
  document.addEventListener('dragstart',e => { const card = e.target.closest('[data-order]'); if (!card) return; draggedId = Number(card.dataset.order); e.dataTransfer.setData('text/plain',String(draggedId)); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
  document.addEventListener('dragover',e => { const column = e.target.closest('[data-drop-status]'); if (!column || !draggedId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; column.classList.add('drag-over'); });
  document.addEventListener('dragleave',e => { const col = e.target.closest('[data-drop-status]'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
  document.addEventListener('drop',e => { const col = e.target.closest('[data-drop-status]'); if (!col || !draggedId) return; e.preventDefault(); const o = order(draggedId), status = Number(col.dataset.dropStatus); draggedId = null; document.querySelectorAll('.drag-over,.dragging').forEach(el => el.classList.remove('drag-over','dragging')); if (status === 6 && o.status !== 6) confirmFinish(o); else setStatus(o,status); });
  document.addEventListener('dragend',() => { draggedId = null; document.querySelectorAll('.dragging,.drag-over').forEach(el => el.classList.remove('dragging','drag-over')); });
  modal.addEventListener('click',e => { if (e.target === modal) { const rect = modal.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) closeModal(); } });
  document.addEventListener('focusin',e => {
    const combo = e.target.closest?.('.combobox');
    if (combo && e.target.matches('[role="combobox"]')) { openCombobox(combo); e.target.select(); }
    else if (!combo) closeOtherComboboxes(null);
  });
  document.addEventListener('invalid',e => { if (e.target.id === 'signup-phone') updateSignupPhoneValidity(e.target,true); },true);
  document.addEventListener('keydown',e => {
    if (e.target.id === 'signup-phone' && ['Backspace','Delete'].includes(e.key) && e.target.selectionStart === e.target.selectionEnd) {
      const position = e.target.selectionStart, adjacent = e.key === 'Backspace' ? e.target.value[position - 1] : e.target.value[position];
      if (adjacent && /\D/.test(adjacent)) {
        e.preventDefault(); const digits = phoneDigits(e.target.value).split(''), before = phoneDigits(e.target.value.slice(0,position)).length, removeAt = e.key === 'Backspace' ? before - 1 : before;
        if (removeAt >= 0 && removeAt < digits.length) digits.splice(removeAt,1);
        e.target.value = formatBrazilianPhone(digits.join('')); const caret = phoneCaretPosition(e.target.value,Math.max(0,removeAt)); e.target.setSelectionRange(caret,caret); updateSignupPhoneValidity(e.target,true);
      }
    }
    const combo = e.target.closest?.('.combobox');
    if (combo && e.target.matches('[role="combobox"]') && ['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key)) {
      if (e.key === 'Escape') { e.preventDefault(); closeCombobox(combo); return; }
      if (!combo.classList.contains('open')) openCombobox(combo);
      const options = [...combo.querySelectorAll('[data-combo-option]')], current = Number(combo.dataset.activeIndex || -1);
      if (e.key === 'ArrowDown') { e.preventDefault(); setComboActive(combo,current + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setComboActive(combo,current < 0 ? options.length - 1 : current - 1); return; }
      if (e.key === 'Enter' && options.length) { e.preventDefault(); const option = options[current >= 0 ? current : 0]; selectComboOption(combo,option.dataset.value,option.dataset.label); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.querySelector('[data-action="global-search"]')?.click(); }
    if (e.key === 'Escape') document.getElementById('layout')?.classList.remove('menu-visible');
  });
  window.addEventListener('hashchange',() => {
    closeModal(); ui.query = ui.status = ui.priority = ui.mechanic = ''; ui.tab = 'Todas';
    // A seleção de mecânico pode ser compartilhada por URL.
    if (location.hash.includes('servicos?m=')) ui.mechanic = new URLSearchParams(location.hash.split('?')[1]).get('m') || '';
    render(); window.scrollTo(0,0);
  });
  if (route()[0] === 'servicos' && location.hash.includes('?m=')) ui.mechanic = new URLSearchParams(location.hash.split('?')[1]).get('m') || '';
  render();
})();
