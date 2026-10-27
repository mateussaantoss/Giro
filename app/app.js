/* GIRO frontend — rotas por hash, sem dependências de runtime. */
(() => {
  'use strict';
  const { statuses, emptyState } = window.GiroData;
  const STORAGE_PREFIX = 'giro-workshop-v1:';
  const LEGACY_STORAGE = 'giro-demo-v3';
  let storageKey = '';
  let state = emptyState();
  const ui = { collapsed: false, query: '', mechanic: '', status: '', priority: '', tab: 'Todas', view: matchMedia('(max-width: 760px)').matches ? 'list' : 'board', patioMinimized:false, patioExpanded:false, expandedCardKeys:new Set(), chat: 1, chatList: false, report: 7, settings: 'Oficina', historyQuery:'', historyFrom:'', historyTo:'', historyMechanic:'', historyDetail:null, signup: 1, signupData: {}, signupErrors: {}, loginErrors: {}, submitting: false, authChecked: false, authChecking: false, session: null, teamMembers: [], teamLoaded: false, teamLoading: false, activationName: '', activationLoaded: false, activationDone: false, activationError: '', serverOrders: [], closedOrders: [], serverOrdersLoaded: false, serverOrdersLoading: false, workshopClients:[], workshopVehicles:[], workshopVehiclesLoaded:false, workshopVehiclesLoading:false, quickCreatedOrder: null };
  const localISODate = date => { const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0'), d=String(date.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; };
  const monthStart = new Date(new Date().getFullYear(),new Date().getMonth(),1), nextMonthStart = new Date(new Date().getFullYear(),new Date().getMonth()+1,1);
  Object.assign(ui,{ inventoryItems:[], inventoryMovements:[], inventoryLoaded:false, inventoryLoading:false, inventoryError:'', inventoryQuery:'', inventoryFilter:'active', materialsCache:new Map(), workshopGeneration:0, serviceTemplates:[], serviceTemplatesLoaded:false, serviceTemplatesLoading:false, serviceTemplatesError:'', revenueReport:null, revenueLoading:false, revenueError:'', revenueFrom:localISODate(monthStart), revenueTo:localISODate(nextMonthStart), revenueMechanic:'' });
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
    chevronDown: '<path d="m5 9 7 7 7-7"/>',
    chevronUp: '<path d="m5 15 7-7 7 7"/>',
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
    grip: '<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>',
    minimize: '<path d="M8 3v5H3M16 3v5h5M8 21v-5H3m13 5v-5h5"/>',
    maximize: '<path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"/>',
    restore: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'
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
  function validateRecovery(form,showErrors = true) {
    const email = form.elements.email.value.trim();
    const error = email ? isValidEmail(email) ? '' : 'E-mail inválido.' : 'Informe seu e-mail.';
    if (showErrors) setFieldError(form,'email',error);
    return { valid:!error,email:email.toLowerCase() };
  }
  function validateResetPassword(form,showErrors = true) {
    const password = form.elements.password.value, confirmPassword = form.elements.confirmPassword.value, errors = {};
    errors.password = password.trim() && password.length >= 8 && password.length <= 128 ? '' : 'Use uma senha entre 8 e 128 caracteres.';
    errors.confirmPassword = confirmPassword === password ? '' : 'As senhas não coincidem.';
    if (showErrors) Object.entries(errors).forEach(([name,error]) => setFieldError(form,name,error));
    return { valid:!errors.password && !errors.confirmPassword,password,confirmPassword };
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
  async function apiRequest(path, options = {}) {
    const response = await fetch(path,{ credentials:'same-origin', ...options, headers:{ ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) }, body:options.body ? JSON.stringify(options.body) : undefined });
    let data = {}; try { data = await response.json(); } catch (_) {}
    return { response,data };
  }
  function resetTokenFromHash() {
    const query = location.hash.split('?')[1] || '';
    return new URLSearchParams(query).get('token') || '';
  }
  const activationTokenFromHash = resetTokenFromHash;
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
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
  const number = value => new Intl.NumberFormat('pt-BR').format(value);
  const monthlyRevenue = orders => { const now = new Date(); return orders.filter(order => order.status === 2 && order.createdAt && new Date(order.createdAt).getMonth() === now.getMonth() && new Date(order.createdAt).getFullYear() === now.getFullYear()).reduce((sum, order) => sum + Number(order.value || 0), 0); };
  const vehicle = id => state.vehicles.find(v => v.id === Number(id)) || { id:Number(id) || 0, brand:'Veículo', model:'Não identificado', plate:'—', year:'', km:0, client:0, next:'Não informado' };
  const client = id => state.clients.find(c => c.id === Number(id)) || { id:Number(id) || 0, name:'Cliente não encontrado', phone:'', email:'' };
  const member = id => state.team.find(m => m.id === Number(id)) || { id:Number(id) || 0, name:'Sem responsável atribuído', color:'' };
  const order = id => state.orders.find(o => o.id === Number(String(id).replace(/^local-/,'')));
  // Legacy links have their own namespace; numeric server IDs may overlap.
  const legacyOrderMarkup = markup => markup.replace(/#\/ordens\/(\d+)/g,'#/ordens/local-$1');
  const kanbanCard = item => legacyOrderMarkup(localKanbanCard(item));
  const ordersTable = items => legacyOrderMarkup(localOrdersTable(items));
  const workCard = item => legacyOrderMarkup(localWorkCard(item));
  const activities = (limit = 100) => legacyOrderMarkup(localActivities(limit));
  const initials = name => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');
  const avatar = (name, color = '', big = false) => `<span class="avatar ${color} ${big ? 'big' : ''}" aria-hidden="true">${esc(initials(name))}</span>`;
  const badge = status => { const current = Number(status) === 3 ? { name:'Entregue',color:'#94a3b8' } : statuses[Number(status)] || statuses[0]; return `<span class="badge" style="--status:${current.color}"><span class="dot"></span>${current.name}</span>`; };
  const plate = value => `<span class="plate">${esc(value)}</span>`;
  const btn = (text, action, name = '', cls = '', extra = '') => `<button class="btn ${cls}" data-action="${action}" ${extra}>${name ? icon(name) : ''}${text}</button>`;
  const brand = () => '<a class="brand" href="#/dashboard" aria-label="GIRO — Visão geral"><img src="./mark.svg" alt=""><span>GIRO</span></a>';
  const search = (placeholder, id = 'page-search', value = '') => `<label class="search">${icon('search')}<input id="${id}" type="search" placeholder="${placeholder}" aria-label="${placeholder}" value="${esc(value)}"></label>`;
  const carArt = () => '<svg viewBox="0 0 360 150" fill="none" aria-hidden="true"><path d="m30 101 8-32 57-12 38-31h101l47 32 47 15 13 29-9 15H28z" fill="#252c33" stroke="currentColor" stroke-width="2"/><path d="m107 58 32-25h41v25zm83-25h40l38 25h-78z" fill="#10161c" stroke="currentColor" stroke-width="1.5"/><path d="M22 91h318M86 66h186M180 63v39M112 68h17M204 68h17" stroke="currentColor" opacity=".6"/><path d="m39 73 28-5-6 12H36m276-6 16 7 5 8h-18z" fill="#ebf2fa" opacity=".65"/><circle cx="87" cy="111" r="26" fill="#0b0e12" stroke="currentColor" stroke-width="2"/><circle cx="87" cy="111" r="16" stroke="#77818c" stroke-width="5"/><circle cx="280" cy="111" r="26" fill="#0b0e12" stroke="currentColor" stroke-width="2"/><circle cx="280" cy="111" r="16" stroke="#77818c" stroke-width="5"/><path d="M87 95v32m-16-16h32M280 95v32m-16-16h32" stroke="#77818c" stroke-width="3"/><path d="M124 112h119" stroke="#38bdf8" stroke-width="3"/></svg>';
  const route = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard').split('/');
  function save() {
    if (!storageKey) return false;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; }
    catch (_) { toast('Não foi possível salvar no navegador. Libere espaço para preservar as alterações.', true); return false; }
  }
  function loadUserState(user) {
    storageKey = `${STORAGE_PREFIX}${user.id}`;
    let migratedStatuses = false;
    try {
      localStorage.removeItem(LEGACY_STORAGE);
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      state = stored && Array.isArray(stored.orders) && stored.settings ? stored : emptyState(user);
    } catch (_) { state = emptyState(user); }
    if (state.statusVersion !== 2) {
      const legacyStatus = { 0:0, 1:0, 2:0, 3:1, 4:0, 5:0, 6:2 };
      state.orders.forEach(item => { item.status = legacyStatus[item.status] ?? 0; });
      state.statusVersion = 2;
      migratedStatuses = true;
    }
    state.settings = { ...emptyState(user).settings, ...state.settings, name: user.name || state.settings.name, email: user.email || state.settings.email, workshop: user.workshop || state.settings.workshop };
    if (migratedStatuses) save();
  }
  function toast(text, error = false) {
    const el = document.createElement('div'); el.className = `toast ${error ? 'error' : ''}`;
    el.innerHTML = `${icon(error ? 'alert' : 'checkCircle')}<span>${esc(text)}</span>`;
    const toasts = document.getElementById('toasts');
    while (toasts.children.length >= 3) toasts.firstElementChild.remove();
    toasts.append(el); setTimeout(() => el.remove(), 4500);
  }
  const navigate = path => { if (location.hash === `#/${path}`) render(); else location.hash = `/${path}`; };
  function openModal(title, body, footer = '') {
    if (modal.querySelector('[data-sending="true"],[data-outcome-unknown="true"]')) return;
    restoreFocus = document.activeElement;
    modal.innerHTML = `<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Fechar">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;
    removeStaleOrderLinks(modal);
     modal.classList.toggle('order-create-modal', body.includes('id="quick-order-form"'));
     if (!modal.open) modal.showModal();
  }
   function closeModal() { if (modal.querySelector('[data-sending="true"],[data-outcome-unknown="true"]')) return; modal.close(); modal.classList.remove('history-modal','inventory-history-modal','order-create-modal','mechanic-order-create'); if (restoreFocus?.isConnected) restoreFocus.focus(); }
  modal.addEventListener('cancel',event => { if (modal.querySelector('[data-sending="true"],[data-outcome-unknown="true"]')) event.preventDefault(); });
   modal.addEventListener('close',() => modal.classList.remove('history-modal','inventory-history-modal','order-create-modal','mechanic-order-create'));
  function removeStaleOrderLinks(root) {
    root.querySelectorAll('[data-action="open-order"]').forEach(el => {
      if (!order(el.dataset.id)) (el.closest('.attention-bar, .notification-item') || el).remove();
    });
  }
  const empty = (text = 'Nenhum resultado encontrado', sub = 'Experimente ajustar a busca ou os filtros.') => `<div class="empty">${icon('search')}<strong>${text}</strong><p>${sub}</p></div>`;
  const metric = (label, value, foot, name, cls = '') => `<article class="metric ${cls}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(name)}</span></div><div class="metric-value ${String(value).includes('R$') ? 'currency' : ''}">${value}</div><div class="metric-foot">${foot}</div></article>`;
  const currentDate = () => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const greeting = name => `${new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'}${name ? `, ${esc(name.split(' ')[0])}` : ''}.`;
  const heading = (title, subtitle, actions = '', date = false) => `<div class="page-heading"><div>${date ? `<div class="date-label">${icon('calendar')}${currentDate()}</div>` : ''}<h1>${title}</h1><p class="subtext">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
  const allNavItems = [ ['dashboard','grid','Visão Geral'], ['servicos','wrench','Serviços'], ['ordens','clipboard','Ordens de Serviço'], ['clientes','users','Clientes'], ['estoque','box','Estoque'], ['whatsapp','chat','WhatsApp'], ['historico','history','Histórico'], ['equipe','users','Equipe'], ['relatorios','chart','Relatórios'], ['configuracoes','settings','Configurações'] ];
  let navItems = allNavItems;
  const roleMenus = { OWNER:['dashboard','ordens','clientes','estoque','historico','equipe','relatorios','configuracoes'], MANAGER:['dashboard','ordens','clientes','estoque','historico','equipe','relatorios'], ATTENDANT:['dashboard','ordens','clientes','historico'], MECHANIC:['inicio','servicos','historico'] };
  const roleLabels = { OWNER:'Administrador', ADMIN:'Administrador', MANAGER:'Gerente', ATTENDANT:'Atendente', MECHANIC:'Mecânico' };
  const roleLabel = role => roleLabels[String(role || '').toUpperCase()] || 'Usuário';
  const menuForUser = () => (roleMenus[ui.session?.role] || roleMenus.ATTENDANT).map(key => key === 'inicio' ? ['dashboard','grid','Início'] : key === 'servicos' ? ['servicos','wrench','Meus Serviços'] : allNavItems.find(item => item[0] === key)).filter(Boolean);
  const pageAllowed = page => (roleMenus[ui.session?.role] || roleMenus.ATTENDANT).includes(page === 'dashboard' && ui.session?.role === 'MECHANIC' ? 'inicio' : page);
  function shell(content, page) {
    const renderedPaths = new Set();
    const navLink = ([path, name, label]) => {
       if (path === 'configuracoes' && ui.session?.role !== 'OWNER' || path === 'ajuda' && ui.session?.role === 'MECHANIC') return '';
      if (renderedPaths.has(path)) return '';
      renderedPaths.add(path);
      return `<a href="#/${path}" class="${page === path ? 'active' : ''}" ${page === path ? 'aria-current="page"' : ''} title="${label}">${icon(name)}<span class="nav-label">${label}</span>${path === 'ordens' ? `<span class="nav-count">${state.orders.filter(o => o.status !== 2).length + ui.serverOrders.filter(o => o.status !== 2).length}</span>` : ''}</a>`;
    };
    const label = [...navItems, ['ajuda','','Ajuda'], ['patio','','Pátio da Oficina']].find(n => n[0] === page)?.[2] || (ui.session?.role === 'MECHANIC' ? 'Início' : 'Ordem de Serviço');
    return `<div class="${ui.collapsed ? 'sidebar-collapsed' : ''}" id="layout"><button class="menu-shade" data-action="menu" aria-label="Fechar menu"></button><aside class="sidebar"><div class="brand-area">${brand()}<button class="icon-btn" data-action="collapse" aria-label="Recolher ou expandir menu">${icon('left')}</button></div><div class="workspace-label">WORKSPACE DA OFICINA</div><nav class="nav" aria-label="Navegação principal">${navItems.map(navLink).join('')}</nav><div class="sidebar-bottom"><nav class="nav" aria-label="Suporte">${[['configuracoes','settings','Configurações'],['ajuda','help','Ajuda']].map(navLink).join('')}</nav><div class="workshop-card"><div class="workshop-name">${esc(state.settings.workshop)}</div><div class="row">${avatar(state.settings.name)}<div class="user-info grow"><strong>${esc(state.settings.name)}</strong><small>Administrador</small></div><button class="icon-btn" data-action="logout" aria-label="Sair da demonstração">${icon('logout')}</button></div></div></div></aside><div class="app-shell"><header class="topbar"><div class="row"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Abrir menu">${icon('menu')}</button><div class="breadcrumb">${icon('grid')}<span>Workspace</span>${icon('chevron')}<strong>${label}</strong></div></div><div class="top-actions"><span class="demo-tag">DEMONSTRAÇÃO</span><span class="live-status"><span class="dot"></span>Oficina em operação</span>${themeBtn()}<button class="icon-btn" data-action="global-search" aria-label="Buscar em todo o sistema">${icon('search')}</button><button class="icon-btn" data-action="notifications" aria-label="Notificações">${icon('bell')}${!state.readNotifications ? '<span class="notification-dot"></span>' : ''}</button>${avatar(state.settings.name)}</div></header><main id="main" tabindex="-1"><div class="page-enter">${content}</div><footer class="footer"><span>© 2026 GIRO · Sua oficina em movimento.</span><span>${icon('shield')}Ambiente de demonstração · Dados fictícios</span></footer></main></div><nav class="mobile-nav" aria-label="Acesso rápido">${[['servicos','wrench','Meu trabalho'],['ordens','clipboard','OS'],['veiculos','car','Veículos'],['whatsapp','chat','WhatsApp']].map(([path,name,text]) => `<a href="#/${path}" class="${page === path ? 'active' : ''}">${icon(name)}${text}</a>`).join('')}</nav></div>`;
  }
  const unread = () => state.conversations.reduce((sum,c) => sum + c.unread, 0);
  function filteredOrders() {
    const q = ui.query.toLocaleLowerCase('pt-BR');
    return state.orders.filter(o => {
      const v = vehicle(o.vehicle), c = client(v.client);
       return o.status !== 3 && `${o.id} ${v.brand} ${v.model} ${v.plate} ${c.name} ${o.service}`.toLocaleLowerCase('pt-BR').includes(q)
        && (!ui.mechanic || o.mechanic === Number(ui.mechanic)) && (ui.status === '' || o.status === Number(ui.status)) && (!ui.priority || o.priority === ui.priority)
        && (ui.tab === 'Todas' || statuses[Number(o.status)]?.name === ui.tab);
    });
  }
  function filteredServerOrders() {
    const q = ui.query.toLocaleLowerCase('pt-BR');
    return ui.serverOrders.filter(item => !item.closedAt && `${item.id} ${item.clientName} ${item.plate} ${item.vehicleBrand} ${item.vehicleModel} ${item.issue}`.toLocaleLowerCase('pt-BR').includes(q) && (!ui.mechanic || String(item.assignedUserId || '') === ui.mechanic) && (ui.status === '' || item.status === Number(ui.status)) && (!ui.priority || item.priority === ui.priority) && (ui.tab === 'Todas' || statuses[item.status]?.name === ui.tab));
  }
  function filters() {
    const mechanics = new Map();
    state.team.filter(item => item.role === 'Mecânico').forEach(item => mechanics.set(String(item.id),item.name));
    ui.teamMembers.filter(item => item.role === 'MECHANIC' && item.status === 'ACTIVE').forEach(item => mechanics.set(String(item.id),item.name));
    ui.serverOrders.filter(item => item.assignedUserId && item.assignedUserName).forEach(item => mechanics.set(String(item.assignedUserId),item.assignedUserName));
    return `<div class="board-controls">${search('Buscar placa, cliente ou OS...', 'page-search', ui.query)}<div class="filter-group"><button class="filter-reset" data-action="reset-filters">Todos${ui.mechanic || ui.status !== '' || ui.priority ? ' · limpar filtros' : ''}</button><select id="mechanic-filter" aria-label="Filtrar por mecânico"><option value="">Mecânico</option>${[...mechanics].map(([id,name]) => `<option value="${esc(id)}" ${ui.mechanic === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select><select id="status-filter" aria-label="Filtrar por status"><option value="">Status</option>${statuses.map((s,i) => `<option value="${i}" ${ui.status === String(i) ? 'selected' : ''}>${s.name}</option>`).join('')}</select><select id="priority-filter" aria-label="Filtrar por prioridade"><option value="">Prioridade</option>${['Normal','Alta','Urgente'].map(p => `<option ${ui.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>`;
  }
  function cardMissingFields(order,remote = false) {
    if (remote) {
      const missing=[];
      if (!order.clientName) missing.push('Cliente');
      if (!order.phone) missing.push('Telefone');
      if (!order.vehicleBrand) missing.push('Marca');
      if (!order.vehicleModel) missing.push('Modelo');
      if (!order.plate) missing.push('Placa');
      if (!order.issue && !order.service) missing.push('Problema/serviço');
      return missing;
    }
    const v=vehicle(order.vehicle), c=client(v.client), m=member(order.mechanic), missing=[];
    if (!c.name || c.name === 'Cliente não encontrado') missing.push('Cliente');
    if (!v.brand || v.brand === 'Veículo') missing.push('Marca');
    if (!v.model || v.model === 'Não identificado') missing.push('Modelo');
    if (!v.plate || v.plate === '—') missing.push('Placa');
    if (!order.service && !order.issue) missing.push('Problema/serviço');
    if (!m.name || m.name.startsWith('Sem responsável')) missing.push('Mecânico');
    return missing;
  }
  const cardExpanded = key => ui.expandedCardKeys.has(String(key));
  function toggleKanbanCard(key) {
    key=String(key);
    if (ui.expandedCardKeys.has(key)) ui.expandedCardKeys.delete(key); else ui.expandedCardKeys.add(key);
    render();
  }
  function visibleKanbanCardKeys() {
    return [...state.orders.filter(item => item.status !== 3).map(item => `local:${item.id}`),...ui.serverOrders.filter(item => !item.closedAt).map(item => `server:${item.id}`)];
  }
  function toggleAllKanbanCards() {
    const keys=visibleKanbanCardKeys();
    if (keys.length && keys.every(key => ui.expandedCardKeys.has(key))) keys.forEach(key => ui.expandedCardKeys.delete(key));
    else keys.forEach(key => ui.expandedCardKeys.add(key));
    render();
  }
  function displayUpdatedAt(value) {
    if (!value) return '';
    const date=new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  function localKanbanCard(o) {
    const v=vehicle(o.vehicle), c=client(v.client), m=member(o.mechanic), key=`local:${o.id}`, expanded=cardExpanded(key), missing=cardMissingFields(o);
    const last=(o.history || []).at(-1)?.date || o.updatedAt || o.createdAt || '';
    return `<article class="kanban-card kanban-card-compact ${expanded ? 'is-expanded' : ''}" data-card-key="${key}"><div class="kanban-card-summary"><div class="kanban-card-title"><span class="car-brand">${esc(v.brand)}</span><strong class="car-model">${esc(v.model)}</strong></div><div class="kanban-card-actions">${missing.length ? `<span class="card-incomplete-icon" title="Cadastro incompleto" aria-label="Cadastro incompleto">${icon('alert')}</span>` : ''}<span class="os-number">OS #${o.id}</span><button class="card-expand-btn" type="button" data-action="toggle-kanban-card" data-card-key="${key}" aria-expanded="${expanded}" aria-label="${expanded ? 'Recolher' : 'Expandir'} OS #${o.id}" title="${expanded ? 'Recolher' : 'Expandir'}">${icon(expanded ? 'chevronUp' : 'chevronDown')}</button></div></div>${v.plate && v.plate !== '—' ? `<div class="kanban-card-plate">${plate(v.plate)}</div>` : ''}<div class="kanban-card-details"><div class="kanban-card-details-inner">${missing.length ? `<p class="card-incomplete-note">${icon('alert')}Cadastro incompleto · faltam: ${missing.map(esc).join(', ')}</p>` : ''}${c.name && c.name !== 'Cliente não encontrado' ? `<div class="card-detail-row"><small>Cliente</small><span>${esc(c.name)}</span></div>` : ''}${c.phone ? `<div class="card-detail-row"><small>Telefone</small><span>${esc(c.phone)}</span></div>` : ''}${o.service || o.issue ? `<div class="card-detail-row"><small>Serviço / problema</small><span>${esc(o.service || o.issue)}</span></div>` : ''}${m.name && !m.name.startsWith('Sem responsável') ? `<div class="card-detail-row"><small>Mecânico</small><span>${esc(m.name)}</span></div>` : ''}<div class="card-detail-row"><small>Status</small><span>${badge(o.status)}</span></div>${o.priority && o.priority !== 'Normal' ? `<div class="card-detail-row"><small>Prioridade</small><span>${esc(o.priority)}</span></div>` : ''}${last ? `<div class="card-detail-row"><small>Atualizado</small><span>${esc(displayUpdatedAt(last))}</span></div>` : ''}<a class="card-open-link" href="#/ordens/${o.id}">Ver detalhes ${icon('arrow')}</a></div></div></article>`;
  }
  function serverKanbanCard(o) {
    const vehicleName=[o.vehicleBrand,o.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado', key=`server:${o.id}`, expanded=cardExpanded(key), missing=cardMissingFields(o,true), last=o.history?.at(-1)?.at || o.finishedAt || o.entryAt;
    return `<article class="kanban-card kanban-card-compact ${expanded ? 'is-expanded' : ''}" data-card-key="${key}"><div class="kanban-card-summary"><div class="kanban-card-title"><span class="car-brand">${esc(o.vehicleBrand || vehicleName)}</span><strong class="car-model">${esc(o.vehicleModel || '')}</strong></div><div class="kanban-card-actions">${missing.length ? `<span class="card-incomplete-icon" title="Cadastro incompleto" aria-label="Cadastro incompleto">${icon('alert')}</span>` : ''}<span class="os-number">OS #${o.id}</span><button class="card-expand-btn" type="button" data-action="toggle-kanban-card" data-card-key="${key}" aria-expanded="${expanded}" aria-label="${expanded ? 'Recolher' : 'Expandir'} OS #${o.id}" title="${expanded ? 'Recolher' : 'Expandir'}">${icon(expanded ? 'chevronUp' : 'chevronDown')}</button></div></div>${o.plate ? `<div class="kanban-card-plate">${plate(o.plate)}</div>` : ''}<div class="kanban-card-details"><div class="kanban-card-details-inner">${missing.length ? `<p class="card-incomplete-note">${icon('alert')}Cadastro incompleto · faltam: ${missing.map(esc).join(', ')}</p>` : ''}${o.clientName ? `<div class="card-detail-row"><small>Cliente</small><span>${esc(o.clientName)}</span></div>` : ''}${o.phone ? `<div class="card-detail-row"><small>Telefone</small><span>${esc(o.phone)}</span></div>` : ''}${o.issue || o.service ? `<div class="card-detail-row"><small>Serviço / problema</small><span>${esc(o.service || o.issue)}</span></div>` : ''}${o.assignedUserName ? `<div class="card-detail-row"><small>Mecânico responsável</small><span>${esc(o.assignedUserName)}</span></div>` : ''}<div class="card-detail-row"><small>Status</small><span>${badge(o.status)}</span></div>${o.priority && o.priority !== 'Normal' ? `<div class="card-detail-row"><small>Prioridade</small><span>${esc(o.priority)}</span></div>` : ''}${last ? `<div class="card-detail-row"><small>Última atualização</small><span>${esc(displayUpdatedAt(last))}</span></div>` : ''}<a class="card-open-link" href="#/ordens/${o.id}">Ver detalhes ${icon('arrow')}</a></div></div></article>`;
  }
  function boardContent() {
      const orders = filteredOrders();
      const apiOrders = filteredServerOrders();
      const activeExist = state.orders.some(order => order.status !== 3) || ui.serverOrders.some(order => !order.closedAt);
      if (!activeExist) return `<div class="panel empty-state-panel">${icon('clipboard')}<strong>Nenhuma OS ativa no momento.</strong><p>Ordens entregues permanecem no Histórico.</p>${btn('Nova OS','new-order','plus','primary')}</div>`;
      if (ui.view === 'list') return `${ordersTable(orders)}${quickOrdersSection(apiOrders)}`;
      return `<div class="board-scroll"><div class="board">${statuses.map((s,i) => { const local = orders.filter(o => o.status === i), api = apiOrders.filter(o => o.status === i); return `<section class="kanban-column" data-drop-status="${i}" aria-label="${s.name}"><div class="column-heading" style="--status:${s.color}"><span class="dot"></span>${s.name}<span class="column-count">${local.length + api.length}</span></div>${local.map(kanbanCard).join('')}${api.map(serverKanbanCard).join('')}</section>`; }).join('')}</div></div>`;
  }
  function boardSection() {
    const activeCount = state.orders.filter(order => order.status !== 3).length + ui.serverOrders.filter(order => !order.closedAt).length;
    const visibleKeys=visibleKanbanCardKeys(), allExpanded=visibleKeys.length > 0 && visibleKeys.every(key => ui.expandedCardKeys.has(key));
    const expanded = ui.patioExpanded, minimized = ui.patioMinimized;
    const controls = minimized
      ? `<button class="icon-btn patio-mode-btn" data-action="patio-restore" title="Expandir Pátio" aria-label="Expandir Pátio">${icon('chevron')}</button>`
      : expanded
        ? `<button class="icon-btn patio-mode-btn" data-action="patio-restore" title="Restaurar tamanho" aria-label="Restaurar tamanho">${icon('restore')}</button>`
        : `<button class="icon-btn patio-mode-btn" data-action="patio-minimize" title="Minimizar Pátio" aria-label="Minimizar Pátio">${icon('minimize')}</button><button class="icon-btn patio-mode-btn" data-action="patio-maximize" title="Expandir Pátio" aria-label="Expandir Pátio">${icon('maximize')}</button>`;
    return `<section id="patio-section" class="patio-section ${minimized ? 'is-minimized' : ''} ${expanded ? 'is-expanded' : ''}" aria-labelledby="board-title"><header class="patio-header"><div class="section-title">${icon('board')}<h2 id="board-title">Pátio da Oficina</h2><span class="pill">${activeCount} OS</span></div><div class="patio-mode-controls">${controls}</div></header><div id="patio-content" class="patio-content" ${minimized ? 'inert aria-hidden="true"' : ''}>${!minimized ? `${activeCount ? filters() : ''}<div class="patio-toolbar">${ui.view === 'board' && visibleKeys.length ? btn(allExpanded ? 'Recolher todos' : 'Expandir todos','toggle-kanban-all',allExpanded ? 'chevronUp' : 'chevronDown','ghost patio-bulk-toggle') : ''}<div class="view-switch patio-view-switch" aria-label="Visualização do pátio"><button data-action="view-board" class="${ui.view === 'board' ? 'active' : ''}" aria-pressed="${ui.view === 'board'}">${icon('board')}<span>Kanban</span></button><button data-action="view-list" class="${ui.view === 'list' ? 'active' : ''}" aria-pressed="${ui.view === 'list'}">${icon('list')}<span>Lista</span></button></div></div><div id="results">${boardContent()}</div>` : ''}</div></section>`;
  }
  /* Obsolete demo dashboard: the live dashboard below uses only the three canonical statuses.
  function dashboardLegacy() {
    const count = s => state.orders.filter(o => o.status === s).length;
    const pending = state.orders.filter(o => o.status === 2).reduce((sum,o) => sum + o.value,0);
    if (!state.orders.length && !state.clients.length && !state.vehicles.length && !state.team.length) return `${heading('Sua oficina no GIRO','Comece cadastrando os dados da sua operação.',btn('Cadastrar cliente','new-client','plus','primary'))}<section class="panel empty-state-panel"><h2>Comece pelo primeiro cadastro</h2><p class="subtext">Cadastre um cliente para depois adicionar veículos e ordens de serviço.</p>${btn('Cadastrar cliente','new-client','plus','primary')}</section>`;
    return `${heading(`Boa tarde, ${esc(state.settings.name.split(' ')[0])}.`, 'Veja como está sua oficina hoje.', `<div class="top-search">${search('Buscar no GIRO...', 'global-search-input')}</div>${btn('Nova OS','new-order','plus','primary')}`, true)}<div class="metrics">${metric('VEÍCULOS NA OFICINA',state.orders.length,'<span class="green">+3</span> recebidos hoje','car')}${metric('EM SERVIÇO',count(4),`${new Set(state.orders.filter(o => o.status === 4).map(o => o.mechanic)).size} mecânicos trabalhando`,'wrench')}${metric('AGUARDANDO APROVAÇÃO',count(2),`<span style="color:#7dd3fc">${money(pending)}</span> pendentes`,'clock')}${metric('PRONTOS PARA ENTREGA',count(6),'<span class="green">●</span> Aguardando cliente','checkCircle')}${metric('FATURAMENTO DO MÊS',money(48750),`${icon('up')}<span class="green">12,4%</span> vs. mês anterior`,'wallet','revenue')}</div><div class="attention-bar">${icon('alert')}<strong>${state.orders.filter(o => o.late && o.status !== 6).length} veículo precisa de atenção</strong><span>· Peça pendente para o Civic #1029</span><button class="btn-link" data-action="open-order" data-id="1029">Ver pendência ${icon('arrow')}</button></div>${boardSection()}<div class="bottom-grid"><section class="panel"><div class="section-heading"><h2>Últimas movimentações</h2><a class="btn-link" href="#/historico" style="font-size:10px;min-height:20px">Ver histórico ${icon('arrow')}</a></div>${activities(3)}</section><section class="panel"><div class="section-heading"><h2>Equipe em ação</h2><a href="#/equipe" class="muted" style="font-size:10px">Ver equipe →</a></div>${state.team.filter(m => m.role === 'Mecânico').map(m => { const n = state.orders.filter(o => o.mechanic === m.id && o.status < 6).length; return `<div class="team-row">${avatar(m.name,m.color)}<div class="grow"><strong>${esc(m.name)}</strong><p>${esc(m.specialty)}</p></div><div><span class="badge" style="--status:#38bdf8">${n} serviços</span><div class="capacity"><span style="width:${Math.min(n * 25,100)}%"></span></div></div></div>`; }).join('')}</section><section class="panel"><div class="section-heading"><h2>Ritmo do dia</h2>${icon('up')}</div><div class="daily-target"><div class="ring"><div><strong>76<span style="font-size:13px">%</span></strong><small>da meta diária</small></div></div><div><strong>R$ 3.800</strong><p>de R$ 5.000 previstos</p><p class="green">No caminho certo ↗</p></div></div><div class="target-foot">Bom ritmo! Mais <strong class="orange">R$ 1.200</strong> para atingir a meta.<br>Referência ilustrativa do dia de demonstração.</div></section></div>`;
  }
  */
  function overviewOrders() {
    const local = state.orders.filter(order => order.status !== 3).map(order => {
      const v = vehicle(order.vehicle), c = client(v.client), m = member(order.mechanic);
      return { id:order.id, status:order.status, plate:v.plate, vehicle:[v.brand,v.model].filter(Boolean).join(' '), client:c.name, mechanic:m.name, mechanicId:order.mechanic, entry:order.entry, local:true };
    });
    const remote = ui.serverOrders.filter(order => !order.closedAt).map(order => ({ id:order.id, status:order.status, plate:order.plate || 'Placa não informada', vehicle:[order.vehicleBrand,order.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado', client:order.clientName || 'Cliente não informado', mechanic:order.assignedUserName || 'Não atribuído', mechanicId:order.assignedUserId, entry:order.entryAt, local:false }));
    return [...local,...remote];
  }

  function workshopSummary() {
    const today=new Date().toDateString();
    const orders=[...state.orders,...ui.serverOrders,...ui.closedOrders];
    const createdToday=orders.filter(order => {
      const timestamp=order.createdAt || order.entryAt;
      return timestamp && new Date(timestamp).toDateString() === today;
    }).length;
    const deliveredToday=orders.filter(order => order.closedAt && new Date(order.closedAt).toDateString() === today).length;
    const mechanics=[...new Set(overviewOrders().filter(order => order.mechanicId).map(order => order.mechanic))];
    const localEvents=state.orders.flatMap(order => (order.history || []).map(event => ({ id:`local-${order.id}`,text:event.text,at:event.at || event.date })));
    const apiEvents=[...ui.serverOrders,...ui.closedOrders].flatMap(order => (order.history || []).map(event => ({ id:order.id,text:event.text || event.action,at:event.at })));
    const events=[...localEvents,...apiEvents].filter(event => event.text).sort((a,b) => new Date(b.at) - new Date(a.at)).slice(0,5);
    return `<details class="workshop-summary"><summary><span>Resumo da Oficina</span></summary><div class="workshop-summary-content"><div class="summary-stat-row"><span>OS criadas hoje</span><strong>${createdToday}</strong><span>Entregues hoje</span><strong>${deliveredToday}</strong><span>Mecânicos com OS</span><strong>${mechanics.length}</strong></div><h3>Atividade recente</h3>${events.length ? events.map(event => `<a class="summary-activity" href="#/ordens/${event.id}"><time>${event.at ? displayUpdatedAt(event.at) : ''}</time><span>${esc(event.text)}</span></a>`).join('') : '<p class="subtext">Nenhuma atividade recente.</p>'}<a class="btn-link" href="#/historico">Ver histórico completo ${icon('arrow')}</a></div></details>`;
  }

  /* Retired large dashboard accordions; the Pátio is now the single operational surface.
  function overviewDetails() {
    const active = overviewOrders();
    const entrance = active.filter(order => order.status === 0), parts = active.filter(order => order.status === 1), ready = active.filter(order => order.status === 2);
    const mechanics = [...new Set(active.filter(order => order.mechanic !== 'Não atribuído').map(order => order.mechanic))];
    const recent = [...active].sort((a,b) => new Date(b.entry) - new Date(a.entry)).slice(0,5);
    const activity = [...ui.serverOrders,...ui.closedOrders].flatMap(order => (order.history || []).map(event => ({ orderId:order.id,text:event.text || event.action,at:event.at || order.entryAt }))).sort((a,b) => new Date(b.at) - new Date(a.at)).slice(0,5);
    const row = item => `<article class="overview-order"><a href="#/ordens/${item.local ? 'local-' : ''}${item.id}"><strong>OS #${item.id}</strong><span>${esc(item.plate)} · ${esc(item.vehicle)}</span><small>${esc(item.client)} · ${esc(item.mechanic)}</small></a>${item.status === 2 ? (item.local ? btn('Entregar veículo','deliver-local-order','check','small',`data-id="${item.id}"`) : btn('Entregar veículo','deliver-order','check','small',`data-id="${item.id}"`)) : `<span class="overview-status">${statuses[item.status]?.name || 'Entrada'}</span>`}</article>`;
    return `<section class="overview-grid" aria-label="Resumo operacional"><details class="overview-card"><summary><span>Veículos na oficina</span><strong>${active.length}</strong></summary><div>${active.length ? active.map(row).join('') : '<p class="subtext">Nenhuma OS ativa.</p>'}<a class="btn-link" href="#/ordens">Ver todas</a></div></details><details class="overview-card"><summary><span>Entrada</span><strong>${entrance.length}</strong></summary><div>${entrance.length ? entrance.map(row).join('') : '<p class="subtext">Nenhuma OS em Entrada.</p>'}</div></details><details class="overview-card"><summary><span>Aguardando peças</span><strong>${parts.length}</strong></summary><div>${parts.length ? parts.map(row).join('') : '<p class="subtext">Nenhuma OS aguardando peças.</p>'}<a class="btn-link" href="#/ordens">Ver todas</a></div></details><details class="overview-card"><summary><span>Prontos para entrega</span><strong>${ready.length}</strong></summary><div>${ready.length ? ready.map(row).join('') : '<p class="subtext">Nenhum veículo pronto.</p>'}<a class="btn-link" href="#/ordens">Ver todas</a></div></details><details class="overview-card"><summary><span>Mecânicos com OS</span><strong>${mechanics.length}</strong></summary><div>${mechanics.length ? mechanics.map(name => `<p class="overview-order"><strong>${esc(name)}</strong><span>${active.filter(order => order.mechanic === name).length} OS ativas</span></p>`).join('') : '<p class="subtext">Nenhum mecânico com OS atribuída.</p>'}</div></details><details class="overview-card"><summary><span>OS recentes</span><strong>${recent.length}</strong></summary><div>${recent.length ? recent.map(row).join('') : '<p class="subtext">Nenhuma OS recente.</p>'}<a class="btn-link" href="#/ordens">Ver todas</a></div></details><details class="overview-card"><summary><span>Atividade recente</span><strong>${activity.length}</strong></summary><div>${activity.length ? activity.map(event => `<p class="overview-order"><a href="#/ordens/${event.orderId}"><strong>OS #${event.orderId}</strong><span>${esc(event.text)}</span><small>${new Date(event.at).toLocaleString('pt-BR')}</small></a></p>`).join('') : '<p class="subtext">Nenhuma atividade registrada.</p>'}<a class="btn-link" href="#/historico">Abrir Histórico</a></div></details></section>`;
  }
  */

  function dashboard() {
      const count = status => state.orders.filter(order => order.status === status).length;
       const revenue = ui.revenueReport?.summary?.netRevenue;
      const name = state.settings.name || ui.session?.name || '';
      if (ui.session?.role === 'MECHANIC') {
        const mine = ui.serverOrders.filter(item => item.status !== 2);
        const today = new Date().toDateString();
        const finishedToday = ui.serverOrders.filter(item => item.status === 2 && item.finishedAt && new Date(item.finishedAt).toDateString() === today).length;
         return `${heading(`Olá, ${esc(name.split(' ')[0])}.`, 'Seus serviços de hoje', btn('Nova Ordem de Serviço','new-quick-order','plus','primary large'))}<div class="metrics">${metric('SERVIÇOS ATRIBUÍDOS',mine.length,'','clipboard')}${metric('ENTRADA',mine.filter(item => item.status === 0).length,'','car')}${metric('AGUARDANDO PEÇAS',mine.filter(item => item.status === 1).length,'','box')}${metric('CONCLUÍDOS HOJE',finishedToday,'','checkCircle')}</div><section class="panel"><h2>Meus serviços</h2>${mine.length ? mine.map(mechanicServiceCard).join('') : empty('Você não possui serviços atribuídos no momento.','Quando uma ordem for atribuída a você, aparecerá aqui.')}</section>`;
      }
      if (ui.session?.role === 'ATTENDANT') return `${heading(greeting(name), 'Atendimentos e ordens recentes.', btn('Nova OS','new-order','plus','primary'))}<div class="metrics">${metric('VEÍCULOS NA OFICINA',overviewOrders().length,'','car')}${metric('ENTRADA',state.orders.filter(item => item.status === 0).length + ui.serverOrders.filter(item => item.status === 0).length,'','car')}${metric('AGUARDANDO PEÇAS',state.orders.filter(item => item.status === 1).length + ui.serverOrders.filter(item => item.status === 1).length,'','box')}${metric('PRONTOS',state.orders.filter(item => item.status === 2).length + ui.serverOrders.filter(item => item.status === 2).length,'','checkCircle')}</div>${boardSection()}${workshopSummary()}`;
      if (ui.session?.role === 'MANAGER') return `${heading(greeting(name), 'Acompanhe a operação da sua oficina.', btn('Nova OS','new-order','plus','primary'), true)}<div class="metrics">${metric('VEÍCULOS NA OFICINA',overviewOrders().length,'','car')}${metric('ENTRADA',state.orders.filter(item => item.status === 0).length + ui.serverOrders.filter(item => item.status === 0).length,'','car')}${metric('AGUARDANDO PEÇAS',state.orders.filter(item => item.status === 1).length + ui.serverOrders.filter(item => item.status === 1).length,'','box')}${metric('PRONTOS',state.orders.filter(item => item.status === 2).length + ui.serverOrders.filter(item => item.status === 2).length,'','checkCircle')}</div>${boardSection()}${workshopSummary()}`;
      if (!state.clients.length && !state.orders.length && !ui.serverOrders.length && !ui.closedOrders.length) return onboarding();
       return `${heading(greeting(name), 'Veja como está sua oficina hoje.', `<div class="top-search">${search('Buscar no GIRO...', 'global-search-input')}</div>${btn('Nova OS','new-order','plus','primary')}`, true)}<div class="metrics">${metric('VEÍCULOS NA OFICINA',overviewOrders().length,'','car')}${metric('ENTRADA',state.orders.filter(item => item.status === 0).length + ui.serverOrders.filter(item => item.status === 0).length,'','car')}${metric('AGUARDANDO PEÇAS',state.orders.filter(item => item.status === 1).length + ui.serverOrders.filter(item => item.status === 1).length,'','box')}${metric('PRONTOS',state.orders.filter(item => item.status === 2).length + ui.serverOrders.filter(item => item.status === 2).length,'','checkCircle')}${metric('FATURAMENTO DO MÊS', revenue == null ? 'Carregando...' : money(revenue), 'Receita líquida das OS entregues', 'wallet', 'revenue')}</div>${boardSection()}${workshopSummary()}`;
   }
   function onboarding() {
     const mechanicInvited = ui.teamMembers.some(user => user.role === 'MECHANIC' && user.status !== 'INACTIVE');
     return `${heading('Comece por aqui', 'Configure o básico da sua oficina em poucos passos.')}
       <section class="onboarding panel" aria-labelledby="onboarding-title">
         <div class="onboarding-intro"><span class="eyebrow">PRIMEIRO ACESSO</span><h2 id="onboarding-title">Vamos colocar sua oficina para rodar</h2><p class="subtext">Como administrador, comece convidando um mecânico e organize o primeiro atendimento.</p></div>
         <div class="onboarding-steps">
           <article class="onboarding-step ${mechanicInvited ? '' : 'active'}"><span class="step-number">1</span><div><strong>Convide um mecânico</strong><p>Informe nome e e-mail. Ele receberá um convite para criar a própria senha.</p></div>${mechanicInvited ? '<span class="step-status">MECÂNICO CADASTRADO</span>' : btn('Convidar mecânico','new-member','plus','primary')}</article>
           <article class="onboarding-step ${mechanicInvited ? 'active' : ''}"><span class="step-number">2</span><div><strong>Cadastre um cliente</strong><p>Informe os dados de contato do cliente para organizar seus atendimentos.</p></div>${mechanicInvited ? btn('Cadastrar cliente','new-client','plus','primary') : '<span class="step-status">PRÓXIMO PASSO</span>'}</article>
           <article class="onboarding-step"><span class="step-number">3</span><div><strong>Crie a primeira ordem de serviço</strong><p>Informe o veículo e o problema na OS e acompanhe o andamento no pátio.</p></div><span class="step-status">DEPOIS</span></article>
         </div>
       </section>`;
   }
  function localActivities(limit = 100) {
    const custom = state.orders.flatMap(o => (o.history || []).slice(1).map(h => ({ ...h, id:o.id, vehicle:o.vehicle }))).reverse();
    return custom.slice(0,limit).map((a,i) => `<a href="#/ordens/${a.id}" class="activity"><span class="activity-icon ${i === 1 ? 'amber' : i === 2 ? 'blue' : ''}">${icon(a.type || 'checkCircle')}</span><div><strong>${esc(a.text)}</strong><p>OS #${a.id} · ${esc(vehicle(a.vehicle).brand)} ${esc(vehicle(a.vehicle).model.split(' ')[0])} · ${esc(vehicle(a.vehicle).plate)}</p></div><time>${esc(a.date)}</time></a>`).join('');
  }
  function localOrdersTable(orders) {
    if (!orders.length) return empty();
    return `<div class="table-wrap"><table><thead><tr>${['OS','Veículo / Placa','Cliente','Serviço','Mecânico','Status','Valor','Entrada','Previsão'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${orders.map(o => { const v = vehicle(o.vehicle), c = client(v.client); return `<tr><td><a class="btn-link" href="#/ordens/${o.id}">#${o.id}</a></td><td><strong>${esc(v.brand)} ${esc(v.model.split(' ')[0])}</strong><small>${plate(v.plate)}</small></td><td>${esc(c.name)}</td><td><a href="#/ordens/${o.id}" title="Abrir ordem">${esc(o.service.length > 31 ? o.service.slice(0,31) + '…' : o.service)}</a></td><td><span class="row">${avatar(member(o.mechanic).name,member(o.mechanic).color)}${esc(member(o.mechanic).name.split(' ')[0])}</span></td><td>${badge(o.status)}</td><td><strong>${money(o.value)}</strong></td><td>${esc(o.entry)}</td><td class="${o.late ? 'red' : ''}">${esc(o.due)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
   function ordersPage() {
     return `${heading('Ordens de Serviço','Ordens ativas até a entrega do veículo.',btn('Exportar','export-orders','download','ghost optional') + btn('Nova Ordem','new-order','plus','primary'))}${quickOrdersSection(ui.serverOrders)}`;
   }
  function closedLocalOrderPage(id) {
    const o = order(id); if (!o || !(o.status === 3 || o.closedAt)) return notFound();
    const v=vehicle(o.vehicle), c=client(v.client), m=member(o.mechanic);
    return `${heading(`OS #${o.id}`,'Entregue / Encerrada · Consulta somente leitura.',`<a class="btn ghost" href="#/historico">${icon('left')}Voltar ao Histórico</a>`)}<section class="panel"><div class="between"><h2>${esc(v.brand)} ${esc(v.model)}</h2><span class="badge" style="--status:#94a3b8">Entregue</span></div><p>${plate(v.plate)} · ${esc(c.name)} · Mecânico: ${esc(m.name)}</p><p>Problema: ${esc(o.issue || 'Não informado')}</p><p class="subtext">Criada ${esc(o.entry || '')} · Entregue ${o.closedAt ? new Date(o.closedAt).toLocaleString('pt-BR') : ''}</p><h3>Histórico</h3>${(o.history || []).map(item => `<p class="subtext">${esc(item.text || '')} · ${esc(item.date || '')}</p>`).join('')}</section>`;
  }
  function detailPage(id) {
    const o = order(id); if (!o) return notFound();
    const v = vehicle(o.vehicle), c = client(v.client), m = member(o.mechanic);
    const steps = statuses.map(status => status.name);
    const reached = Number(o.status) || 0;
    return `${heading(`<span class="muted" style="font-weight:400">OS</span> #${o.id}`,`Entrada em ${esc(o.entry)}/2026 · Previsão: ${esc(o.due)}`,`<a class="btn ghost optional" href="#/ordens">${icon('left')}Voltar</a>${btn('WhatsApp','order-chat','chat','',`data-id="${o.id}"`)}${btn('Alterar status','change-status','board','primary',`data-id="${o.id}"`)}`)}<div class="detail-hero"><div>${badge(o.status)}<h2>${esc(v.brand)} ${esc(v.model)}</h2><div class="row">${plate(v.plate)}<span class="muted">${v.year}</span><span class="muted">${number(v.km)} km</span><span class="badge" style="--status:${o.priority === 'Urgente' ? '#f87171' : '#38bdf8'}">Prioridade ${o.priority.toLowerCase()}</span></div></div><div class="detail-car">${carArt()}</div><div><div class="eyebrow">Cliente</div><a href="#/clientes/${c.id}"><h3 style="margin:10px 0">${esc(c.name)}</h3></a><span class="muted">${esc(c.phone)}</span></div></div><div class="detail-grid"><div><section class="panel detail-section"><div class="timeline-horizontal">${steps.map((s,i) => `<div class="timeline-step ${i <= reached ? 'done' : ''}"><span class="step-dot">${i <= reached ? '✓' : i + 1}</span>${s}</div>`).join('')}</div><div class="form-grid"><div><div class="eyebrow">Problema relatado</div><p style="margin-top:12px">${esc(o.issue)}</p></div><div><div class="between"><div class="eyebrow">Diagnóstico</div><button class="btn-link" data-action="diagnosis" data-id="${o.id}" style="font-size:11px;min-height:20px">Editar</button></div><p style="margin-top:12px">${esc(o.diagnosis || 'Aguardando avaliação do responsável.')}</p></div></div></section><section class="panel detail-section"><div class="section-heading"><h3>Serviços</h3><button class="btn-link" data-action="add-service" data-id="${o.id}">${icon('plus')}Adicionar</button></div><div class="key-value"><strong>${esc(o.service)}</strong><span>${money(o.value - (o.extraServices || []).reduce((s,x) => s+x.value,0))}</span></div>${(o.extraServices || []).map(s => `<div class="key-value"><strong>${esc(s.name)}</strong><span>${money(s.value)}</span></div>`).join('')}<p style="font-size:11px;margin-top:12px">Valores do orçamento demonstrativo, incluindo peças e mão de obra.</p></section><section class="panel detail-section"><div class="section-heading"><h3>Peças e materiais</h3>${btn('Adicionar peça','add-part','plus','ghost',`data-id="${o.id}"`)}</div>${o.parts?.length ? o.parts.map(p => `<div class="key-value"><strong>${esc(p.name)}</strong><span>${p.qty} un. · Incluído no orçamento</span></div>`).join('') : `<p>${o.id === 1048 ? '1 jogo de pastilhas dianteiras · 1 frasco de fluido DOT 4<br><span class="green">Disponíveis no estoque · Incluídos no orçamento</span>' : o.status === 3 ? '<span style="color:#e7bd74">Compressor do ar-condicionado · Aguardando fornecedor</span>' : 'Nenhuma peça adicional registrada.'}</p>`}</section><section class="panel detail-section"><div class="section-heading"><h3>Fotos do veículo</h3><span class="muted">${o.photos.length} fotos</span></div><div class="photo-grid">${o.photos.map((p,i) => `<a href="${p}" target="_blank" rel="noopener" aria-label="Abrir foto ${i+1}"><img src="${p}" alt="Registro do veículo, foto ${i+1}"></a>`).join('')}<button class="photo-add" data-action="photo" data-id="${o.id}">${icon('camera')}Adicionar foto</button></div></section><section class="panel detail-section"><div class="section-heading"><h3>Observações</h3><button class="btn-link" data-action="note" data-id="${o.id}">${icon('plus')}Adicionar</button></div>${o.notes.length ? o.notes.map(n => `<div class="activity"><span class="activity-icon amber">${icon(n.problem ? 'alert' : 'note')}</span><div><strong>${esc(n.text)}</strong><p>${esc(n.date)} · ${esc(n.author)}</p></div></div>`).join('') : '<p>Nenhuma observação adicional. Registre aqui informações importantes para a equipe.</p>'}</section><section class="panel detail-section"><div class="section-heading"><h3>Histórico do veículo</h3><a class="btn-link" href="#/veiculos/${v.id}">Ver prontuário ${icon('arrow')}</a></div>${vehicleTimeline(v)}</section></div><aside class="stack"><section class="panel"><h3>Responsável</h3><div class="row" style="margin:20px 0">${avatar(m.name,m.color,true)}<div><strong>${esc(m.name)}</strong><p class="subtext" style="font-size:11px">${esc(m.specialty)}</p></div></div><div class="key-value"><span>Tempo registrado</span><strong>${esc(o.elapsed)}</strong></div><div class="key-value"><span>Situação</span><strong>${o.paused ? 'Pausado' : statuses[o.status].name}</strong></div><a class="btn ghost" href="#/servicos/${o.id}" style="width:100%;margin-top:12px">${icon('wrench')}Abrir modo mecânico</a></section><section class="panel"><h3>Resumo do orçamento</h3><div style="margin-top:15px"><div class="key-value"><span>Serviços e materiais</span><strong>${money(o.value)}</strong></div><div class="key-value"><span>Desconto</span><strong>R$ 0</strong></div><div class="key-value total"><span>Total</span><strong>${money(o.value)}</strong></div></div><div class="divider"></div>${btn(o.status === 6 ? 'OS finalizada' : 'Finalizar OS','finish-order','checkCircle',o.status === 6 ? 'success' : 'primary',`data-id="${o.id}" style="width:100%" ${o.status === 6 ? 'disabled' : ''}`)}<p class="subtext" style="font-size:11px">Confira os serviços e faça a inspeção final antes de liberar o veículo.</p></section><section class="panel"><h3>Movimentações desta OS</h3><div style="margin-top:20px" class="timeline-list">${[...o.history].reverse().map(h => `<div class="timeline-item"><time>${esc(h.date)}</time><h4>${esc(h.text)}</h4></div>`).join('')}</div></section></aside></div>`;
  }
  function vehicleTimeline(v) {
    return `<div class="timeline-list">${[{ date:'10/09/2026', text:'Troca de óleo e filtro', km: Math.round(v.km*.95) },{ date:'04/06/2026',text:'Substituição das pastilhas traseiras',km:Math.round(v.km*.87) },{ date:'12/02/2026',text:'Revisão preventiva',km:Math.round(v.km*.77) }].map(h => `<div class="timeline-item"><time>${h.date}</time><h4>${h.text}</h4><p>${number(h.km)} km · Serviço concluído</p></div>`).join('')}</div>`;
  }
  function localWorkCard(o) {
    const v = vehicle(o.vehicle);
    return `<article class="work-card"><div class="between"><span class="eyebrow">OS #${o.id}</span>${badge(o.status)}</div><h2>${esc(v.brand)} ${esc(v.model.split(' ')[0])} ${v.year}</h2><div class="between">${plate(v.plate)}<span class="row muted">${icon('clock')}${o.paused ? 'Aguardando peças' : esc(o.elapsed)}</span></div><div class="work-service"><span class="eyebrow">Serviço</span><h3>${esc(o.service || 'Não informado')}</h3><span class="eyebrow">Problema relatado</span><p class="subtext">${esc(o.issue || 'Não informado')}</p></div><div class="work-actions">${o.status === 0 ? btn('Aguardando peças','set-local-status','box','large',`data-id="${o.id}" data-status="1"`) : ''}${o.status !== 2 ? btn('Finalizado','set-local-status','check','primary large',`data-id="${o.id}" data-status="2"`) : '<span class="badge">Pronto</span>'}</div><div class="quick-actions">${btn('Foto','photo','camera','ghost',`data-id="${o.id}"`)}${btn('Observação','note','note','ghost',`data-id="${o.id}"`)}${btn('Problema','problem','alert','ghost',`data-id="${o.id}"`)}</div><a class="btn-link" href="#/ordens/${o.id}" style="font-size:12px;margin-top:14px">Ver detalhes ${icon('arrow')}</a></article>`;
  }
  function mechanicServiceCard(o) {
    const car = [o.vehicleBrand,o.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado';
    return `<article class="work-card"><div class="between"><span class="eyebrow">OS #${o.id}</span>${badge(o.status)}</div><h2>${esc(car)}</h2><div class="between">${o.plate ? plate(o.plate) : '<span class="muted">Placa não informada</span>'}<span class="badge" style="--status:#fbbf24">${o.status === 1 ? 'Aguardando peças' : 'Entrada'}</span></div><div class="work-service"><span class="eyebrow">Cliente</span><p>${esc(o.clientName || 'Não informado')}${o.phone ? ` · ${esc(o.phone)}` : ''}</p><span class="eyebrow">Problema relatado</span><p class="subtext">${esc(o.issue || 'Não informado')}</p></div><div class="work-actions">${o.status === 0 ? btn('Aguardando peças','quick-order-status','box','large',`data-id="${o.id}" data-status="1"`) : '<button class="btn large" type="button" disabled>Aguardando peças</button>'}${btn('Finalizado','quick-order-status','check','primary large',`data-id="${o.id}" data-status="2"`)}</div><a class="btn-link" href="#/ordens/${o.id}">Ver detalhes ${icon('arrow')}</a></article>`;
  }
  function mechanicServiceCard(o) {
    const car = [o.vehicleBrand,o.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado';
    const actions = o.status === 2
      ? `<span class="badge" style="--status:#4ade80">Pronto</span><button class="btn large" type="button" disabled>Manter como Pronto</button>${btn('Entregar veículo','deliver-order','check','primary large',`data-id="${esc(o.id)}"`)}`
      : `${o.status === 0 ? btn('Aguardando peças','quick-order-status','box','large',`data-id="${esc(o.id)}" data-status="1"`) : '<button class="btn large" type="button" disabled>Aguardando peças</button>'}${btn('Finalizado','quick-order-status','check','primary large',`data-id="${esc(o.id)}" data-status="2"`)}`;
    return `<article class="work-card"><div class="between"><span class="eyebrow">OS #${esc(o.id)}</span>${badge(o.status)}</div><h2>${esc(car)}</h2><div class="between">${o.plate ? plate(o.plate) : '<span class="muted">Placa não informada</span>'}<span class="badge" style="--status:#fbbf24">${o.status === 1 ? 'Aguardando peças' : o.status === 2 ? 'Pronto' : 'Entrada'}</span></div><div class="work-service"><span class="eyebrow">Cliente</span><p>${esc(o.clientName || 'Não informado')}${o.phone ? ` · ${esc(o.phone)}` : ''}</p><span class="eyebrow">Problema relatado</span><p class="subtext">${esc(o.issue || 'Não informado')}</p></div><div class="work-actions">${actions}</div><a class="btn-link" href="#/ordens/${encodeURIComponent(o.id)}">Ver detalhes ${icon('arrow')}</a></article>`;
  }

  async function updateQuickOrderStatus(id,status) {
    try {
      const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(id)}`,{ method:'PATCH',body:{ status } });
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o status.');
       ui.serverOrders = ui.serverOrders.map(item => item.id === data.order.id ? data.order : item);
       if (status === 2 || data.materials || data.reservations) refreshInventoryAfterOrderChange();
       render();
      toast(`OS #${id} → ${statuses[status]?.name || 'status atualizado'}.`);
    } catch (error) { toast(error.message || 'Não foi possível atualizar o status.',true); }
  }
  function workPage(id) {
     const mine = ui.serverOrders.filter(item => item.assignedUserId === ui.session?.id && !item.closedAt && !item.cancelledAt);
     return `${heading('Meus Serviços','Ordens atribuídas a você. Registre o andamento sem sair da área de trabalho.',btn('Nova Ordem de Serviço','new-quick-order','plus','primary large'))}<div id="results" class="work-grid">${mine.map(mechanicServiceCard).join('')}${!mine.length ? empty('Você não possui serviços atribuídos no momento.','Quando uma ordem for atribuída a você, aparecerá aqui.') : ''}</div>`;
  }
  function clientsTable() {
    const items = state.clients.filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(ui.query.toLowerCase()));
    return items.length ? `<div class="table-wrap"><table><thead><tr>${['Cliente','WhatsApp','Veículos','Última visita','Total de serviços',''].map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${items.map(c => { const vs = state.vehicles.filter(v => v.client === c.id); const os = state.orders.filter(o => vs.some(v => v.id === o.vehicle)); return `<tr><td><a href="#/clientes/${c.id}" class="row">${avatar(c.name)}<span><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></span></a></td><td>${esc(c.phone)}</td><td>${vs.length} ${vs.length === 1 ? 'veículo' : 'veículos'}</td><td>${os.length ? '15/09/2026' : '—'}</td><td>${os.length + (vs.length ? 3 : 0)}</td><td><a href="#/clientes/${c.id}" class="btn-link">Ver cliente ${icon('chevron')}</a></td></tr>`; }).join('')}</tbody></table></div>` : empty();
  }
  function workshopClientsSection() {
    const registered = ui.workshopClients.filter(remote => !state.clients.some(local => local.name.toLocaleLowerCase('pt-BR') === remote.name.toLocaleLowerCase('pt-BR') && String(local.phone || '').replace(/\D/g,'') === String(remote.phone || '').replace(/\D/g,'')) && `${remote.name} ${remote.phone}`.toLocaleLowerCase('pt-BR').includes(ui.query.toLocaleLowerCase('pt-BR')));
    if (!registered.length) return '';
    return `<section class="panel" style="margin-top:20px"><div class="section-heading"><h2>Clientes cadastrados pelas OS</h2><span class="pill">${registered.length}</span></div><div id="workshop-client-results" class="entity-grid">${registered.map(remote => { const cars=ui.workshopVehicles.filter(vehicle => vehicle.clientId === remote.id); return `<article class="panel"><h3>${esc(remote.name)}</h3><p class="subtext">${esc(remote.phone)}</p><p class="subtext">${cars.length} ${cars.length === 1 ? 'veículo vinculado' : 'veículos vinculados'}</p></article>`; }).join('')}</div></section>`;
  }
  function clientsPage(id) {
    if (id) {
      const c = client(id); if (!c) return notFound(); const vs = state.vehicles.filter(v => v.client === c.id);
      return `${heading(esc(c.name),'Dados, veículos e histórico do cliente.',btn('Enviar WhatsApp','client-chat','chat','primary',`data-id="${c.id}"`))}<div class="detail-hero"><div class="row">${avatar(c.name,'',true)}<div><h3>${esc(c.name)}</h3><p class="subtext">${esc(c.email)}</p></div></div><div><div class="eyebrow">WhatsApp / Telefone</div><p style="margin-top:10px">${esc(c.phone)}</p></div><a href="#/clientes" class="btn ghost">Voltar aos clientes</a></div><div class="section-heading"><h2>Veículos de ${esc(c.name.split(' ')[0])}</h2><span class="pill">${vs.length} cadastrados</span></div><div class="entity-grid">${vs.map(vehicleCard).join('') || empty('Nenhum veículo cadastrado','Cadastre um veículo para iniciar o histórico.')}</div><section class="panel" style="margin-top:24px"><h2 style="margin-bottom:22px">Histórico de ordens de serviço</h2>${ordersTable(state.orders.filter(o => vs.some(v => v.id === o.vehicle)))}</section>`;
    }
    const totalClients = state.clients.length + ui.workshopClients.filter(remote => !state.clients.some(local => local.name.toLocaleLowerCase('pt-BR') === remote.name.toLocaleLowerCase('pt-BR') && String(local.phone || '').replace(/\D/g,'') === String(remote.phone || '').replace(/\D/g,''))).length;
    return `${heading('Clientes','Contatos, veículos e histórico de atendimento.',btn('Novo cliente','new-client','plus','primary'))}<div class="stats-three">${metric('CLIENTES ATIVOS',totalClients,'Relacionamentos cadastrados','users')}${metric('NOVOS ESTE MÊS',state.clients.length,'Cadastros locais deste mês','user')}${metric('CLIENTES RECORRENTES',state.clients.length,'Histórico local registrado','history')}</div><section class="table-panel"><div class="table-toolbar"><h2>Base de clientes</h2>${search('Buscar nome ou WhatsApp','page-search',ui.query)}</div><div id="results">${clientsTable()}</div></section>${workshopClientsSection()}`;
  }
  function vehicleCard(v) {
    return `<article class="vehicle-card"><div class="vehicle-visual">${carArt()}</div><div class="between"><span class="eyebrow">${esc(v.brand)}</span>${plate(v.plate)}</div><h3>${esc(v.model)}</h3><div class="vehicle-meta"><span>${v.year} · ${number(v.km)} km</span></div><p class="subtext" style="font-size:12px">${icon('user')} ${esc(client(v.client).name)}</p><div class="vehicle-next"><span class="muted">Último serviço</span> · Troca de óleo, 10/09<br><span class="orange">Próxima manutenção</span><br>${esc(v.next)}</div></article>`;
  }
  function chatContext(c) {
    const person = client(c.client), v = vehicle(c.vehicle);
    return `<div class="context-block"><span class="eyebrow">Cliente</span><h4>${esc(person.name)}</h4><span class="muted" style="font-size:11px">${esc(person.phone)}</span></div><div class="context-block"><span class="eyebrow">Veículo</span><h4>${esc(v.brand)} ${esc(v.model.split(' ')[0])} ${v.year}</h4>${plate(v.plate)}</div><div class="bot-collected"><span class="eyebrow">${icon('bot')} Bot coletou</span><p><span class="muted">Problema</span><br>${esc(c.problem)}</p><p><span class="muted">Disponibilidade</span><br>${esc(c.availability)}</p></div>${btn('Criar Ordem de Serviço','new-order','plus','primary',`data-vehicle="${v.id}" data-issue="${esc(c.problem)}"`)}<p class="integration-note">Conversa demonstrativa. As mensagens ficam neste navegador; não são enviadas ao WhatsApp real.</p>`;
  }
  function conversationList() {
    return state.conversations.filter(c => client(c.client).name.toLowerCase().includes(ui.query.toLowerCase())).map(c => { const p = client(c.client), v = vehicle(c.vehicle); return `<button class="conversation ${ui.chat === c.id ? 'selected' : ''}" data-action="select-chat" data-id="${c.id}">${avatar(p.name,c.id === 2 ? 'purple' : '')}<div class="grow"><strong>${esc(p.name)}</strong><p>${esc(v.model.split(' ')[0])} · ${esc(v.plate)}</p><p class="preview">${esc(c.messages.at(-1)?.text || 'Nova conversa')}</p></div>${c.unread ? `<span class="unread">${c.unread}</span>` : ''}</button>`; }).join('') || empty('Nenhuma conversa','Tente outro nome.');
  }
  function whatsappPage() {
    const c = state.conversations.find(c => c.id === ui.chat) || state.conversations[0];
    if (!c) return `${heading('Central WhatsApp','Conversas e dados do atendimento em um só lugar.',`<span class="badge" style="--status:#4ade80">${icon('chat')}Canal demonstrativo</span>`)}<section class="panel">${empty('Nenhuma conversa cadastrada','Cadastre um cliente e um veículo para iniciar um atendimento.')}</section>`;
    const p = client(c.client);
    return `${heading('Central WhatsApp','Conversas e dados do atendimento em um só lugar.',`<span class="badge" style="--status:#4ade80">${icon('chat')}Canal demonstrativo</span>`)}<div class="chat-layout ${ui.chatList ? 'show-list' : ''}"><aside class="conversation-list"><div class="conversation-title"><div class="between"><h3>Conversas</h3><span class="pill">${state.conversations.length}</span></div>${search('Buscar conversa','chat-search',ui.query)}</div><div id="conversations">${conversationList()}</div></aside><section class="chat-main" aria-label="Conversa com ${esc(p.name)}"><div class="chat-header between"><div class="row"><button class="icon-btn chat-back" data-action="chat-list" style="display:none" aria-label="Voltar às conversas">${icon('left')}</button>${avatar(p.name)}<div><strong>${esc(p.name)}</strong><p>Atendimento com Marcos Ribeiro</p></div></div><button class="icon-btn chat-context-toggle" data-action="chat-context" aria-label="Ver dados coletados e criar OS" style="display:none">${icon('clipboard')}</button></div><div class="chat-messages" id="chat-messages"><span class="chat-date">15 de setembro de 2026 · Demonstração</span>${c.messages.map(m => `<div class="message ${m.who}"><div class="message-role">${m.who === 'bot' ? 'BOT · GIRO ASSISTENTE' : m.who === 'attendant' ? 'ATENDENTE · MARCOS' : 'CLIENTE · '+esc(p.name.split(' ')[0]).toUpperCase()}</div><div class="message-bubble">${esc(m.text)}</div><time>${esc(m.time)}${m.who === 'attendant' ? ' · ✓✓' : ''}</time></div>`).join('')}</div><form class="chat-compose" id="message-form"><input name="message" placeholder="Escreva sua mensagem..." aria-label="Mensagem" required maxlength="2000" autocomplete="off"><button class="btn primary" type="submit" aria-label="Enviar mensagem demonstrativa">${icon('send')}</button></form></section><aside class="chat-context">${chatContext(c)}</aside></div>`;
  }
  function teamPage() {
    const roleNames = { OWNER:'Dono', MANAGER:'Gerente', ATTENDANT:'Atendente', MECHANIC:'Mecânico' };
    const statusNames = { PENDING:'Pendente', ACTIVE:'Ativo', INACTIVE:'Inativo' };
    const cards = ui.teamMembers.map(user => {
      const badgeColor = user.status === 'ACTIVE' ? '#4ade80' : user.status === 'PENDING' ? '#fbbf24' : '#9ca3af';
      return `<article class="panel"><div class="between">${avatar(user.name,'',true)}<span class="badge" style="--status:${badgeColor}">${statusNames[user.status] || 'Inativo'}</span></div><h3 style="margin-top:20px">${esc(user.name)}</h3><p class="subtext">${roleNames[user.role] || 'Funcionário'}</p><p class="subtext" style="font-size:12px">${esc(user.email)}</p>${user.phone ? `<p class="subtext" style="font-size:12px">${esc(user.phone)}</p>` : ''}<div class="divider"></div>${user.status === 'PENDING' && ui.session?.role === 'OWNER' ? btn('Reenviar convite','resend-invitation','send','ghost',`data-id="${user.id}" style="width:100%"`) : ''}${user.status !== 'INACTIVE' && ui.session?.role === 'OWNER' ? btn('Desativar acesso','deactivate-member','close','danger',`data-id="${user.id}" style="width:100%;margin-top:8px"`) : ''}</article>`;
    }).join('');
    return `${heading('Equipe','Funcionários e acesso à oficina.',ui.session?.role === 'OWNER' ? btn('Adicionar funcionário','new-member','plus','primary') : '')}<div class="stats-three">${metric('PESSOAS NA EQUIPE',ui.teamMembers.length,'Vinculadas à oficina','users')}${metric('MECÂNICOS',ui.teamMembers.filter(user => user.role === 'MECHANIC').length,'Função mecânico','wrench')}${metric('CONVITES PENDENTES',ui.teamMembers.filter(user => user.status === 'PENDING').length,'Aguardando ativação','mail')}</div>${ui.teamLoading ? '<div class="panel">Carregando equipe…</div>' : ui.teamMembers.length ? `<div class="entity-grid">${cards}</div>` : empty('Nenhum funcionário cadastrado.','Adicione uma pessoa para enviar um convite de acesso.')}`;
  }

  async function loadTeam() {
    if (ui.teamLoading || ui.teamLoaded) return;
    const requestedUserId = ui.session?.id, generation = ui.workshopGeneration;
    ui.teamLoading = true;
    try {
      const { response,data } = await apiRequest('/api/team');
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a equipe.');
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      ui.teamMembers = data.users || []; ui.teamLoaded = true;
    } catch (error) { if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) { ui.teamLoaded = true; toast(error.message || 'Não foi possível carregar a equipe.',true); } }
    finally { if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) { ui.teamLoading = false; if (['equipe','dashboard','patio','ordens','relatorios'].includes(route()[0])) render(); } }
  }
  async function loadRevenueReport() {
    if (!['OWNER','MANAGER'].includes(ui.session?.role) || ui.revenueLoading || !ui.session) return;
    const requestedUserId = ui.session.id, generation = ui.workshopGeneration;
    ui.revenueLoading = true; ui.revenueError = '';
    const params = new URLSearchParams({ from:ui.revenueFrom, to:ui.revenueTo });
    if (ui.revenueMechanic) params.set('assignedUserId',ui.revenueMechanic);
    try {
      const { response,data } = await apiRequest(`/api/reports/revenue?${params}`);
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o faturamento.');
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      ui.revenueReport = data;
    } catch (error) {
      if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) { ui.revenueReport = null; ui.revenueError = error.message || 'Não foi possível carregar o faturamento.'; }
    } finally {
       if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) { ui.revenueLoading = false; if (['dashboard','relatorios'].includes(route()[0])) render(); }
    }
  }
  function revenueCSVUrl() {
    const params = new URLSearchParams({ from:ui.revenueFrom, to:ui.revenueTo });
    if (ui.revenueMechanic) params.set('assignedUserId',ui.revenueMechanic);
    return `/api/reports/revenue.csv?${params}`;
  }
  function exportRevenue() { window.location.href = revenueCSVUrl(); }
  async function loadServiceTemplates() {
    if (ui.serviceTemplatesLoading || ui.serviceTemplatesLoaded || !ui.session) return;
     ui.serviceTemplatesLoading=true; try { const {response,data}=await apiRequest('/api/service-templates?includeInactive=true'); if(!response.ok) throw new Error(data.error || 'Não foi possível carregar os serviços.'); ui.serviceTemplates=data.serviceTemplates || []; ui.serviceTemplatesLoaded=true; } catch(error) { ui.serviceTemplatesError=error.message; ui.serviceTemplatesLoaded=true; } finally { ui.serviceTemplatesLoading=false; const mechanicSelect=document.querySelector('[data-mechanic-service-select]'); if(mechanicSelect) { const selected=mechanicSelect.value; mechanicSelect.innerHTML=`<option value="">Serviço personalizado</option>${ui.serviceTemplates.filter(item=>item.active).map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}`; mechanicSelect.value=selected; } const list=document.querySelector('.service-template-checkboxes'); if(list) { const selected=[...list.querySelectorAll('[data-service-template-checkbox]:checked')].map(input=>input.value); const prices=Object.fromEntries([...list.querySelectorAll('[data-service-template-price]')].map(input=>[input.dataset.templateId,input.value])); list.outerHTML=serviceTemplateCheckboxes(); const next=document.querySelector('.service-template-checkboxes'); selected.forEach(id=>{ const checkbox=next?.querySelector(`[data-service-template-checkbox][value="${id}"]`); const price=next?.querySelector(`[data-service-template-price][data-template-id="${id}"]`); if(checkbox){checkbox.checked=true; if(price){price.disabled=false; price.value=prices[id] || price.value;}} }); } else if(route()[0]==='configuracoes') render(); }
  }

  async function loadServerOrders() {
    if (ui.serverOrdersLoading || ui.serverOrdersLoaded || !ui.session) return;
    const requestedUserId = ui.session.id, generation = ui.workshopGeneration;
    ui.serverOrdersLoading = true;
    try {
      const [activeResult,historyResult] = await Promise.all([apiRequest('/api/orders'),apiRequest('/api/history/orders')]);
      if (!activeResult.response.ok) throw new Error(activeResult.data.error || 'Não foi possível carregar as ordens.');
      if (!historyResult.response.ok) throw new Error(historyResult.data.error || 'Não foi possível carregar o histórico.');
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      ui.serverOrders = (activeResult.data.orders || []).filter(order => !order.closedAt); ui.closedOrders = (historyResult.data.orders || []).filter(order => Boolean(order.closedAt)); ui.serverOrdersLoaded = true;
      for (const order of [...ui.serverOrders,...ui.closedOrders]) {
        if (Array.isArray(order.materials)) ui.materialsCache.set(String(order.id),{ loaded:true,materials:order.materials });
      }
    } catch (error) { if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) { ui.serverOrdersLoaded = true; toast(error.message || 'Não foi possível carregar as ordens.',true); } }
    finally { if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) { ui.serverOrdersLoading = false; if (['dashboard','servicos','ordens','patio','historico'].includes(route()[0])) render(); } }
  }

  async function loadWorkshopVehicles() {
    if (ui.workshopVehiclesLoading || ui.workshopVehiclesLoaded || !ui.session) return;
    const requestedUserId = ui.session.id, generation = ui.workshopGeneration;
    ui.workshopVehiclesLoading = true;
    try {
      const { response,data } = await apiRequest('/api/workshop/vehicles');
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os veículos da oficina.');
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      ui.workshopClients = data.clients || []; ui.workshopVehicles = data.vehicles || []; ui.workshopVehiclesLoaded = true;
    } catch (error) { if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) { ui.workshopVehiclesLoaded = true; toast(error.message || 'Não foi possível carregar os veículos.',true); } }
    finally { if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) { ui.workshopVehiclesLoading = false; if (route()[0] === 'clientes') render(); } }
  }

  function resetWorkshopCache() {
    ui.workshopGeneration++;
    modal.close(); modal.innerHTML = '';
    ui.inventoryItems = []; ui.inventoryMovements = []; ui.inventoryLoaded = false; ui.inventoryLoading = false; ui.inventoryError = ''; ui.inventoryQuery = ''; ui.inventoryFilter = 'active'; ui.materialsCache = new Map();
    storageKey = '';
    ui.serverOrders = []; ui.closedOrders = []; ui.serverOrdersLoaded = false; ui.serverOrdersLoading = false;
    ui.revenueReport = null; ui.revenueLoading = false; ui.revenueError = '';
    ui.teamMembers = []; ui.teamLoaded = false; ui.teamLoading = false;
    ui.workshopClients = []; ui.workshopVehicles = []; ui.workshopVehiclesLoaded = false; ui.workshopVehiclesLoading = false;
  }

  const inventoryManager = () => ['OWNER','MANAGER'].includes(ui.session?.role);
  const materialUser = () => ['OWNER','MANAGER','MECHANIC'].includes(ui.session?.role);
  const inventoryUnits = ['UN','KIT','L','ML','KG','G','M'];
  const quantityLabel = value => Number(value || 0).toLocaleString('pt-BR',{ maximumFractionDigits:3 });
  const lowInventory = item => item.active && item.tracked && Number(item.quantity) <= Number(item.minimumQuantity || 0);
  const remoteOrder = id => [...ui.serverOrders,...ui.closedOrders].find(item => String(item.id) === String(id));

  async function loadInventory() {
    if (!materialUser() || ui.inventoryLoading || ui.inventoryLoaded || ui.inventoryError) return;
    const requestedUserId = ui.session.id, generation = ui.workshopGeneration;
    ui.inventoryLoading = true;
    try {
      const { response,data } = await apiRequest('/api/inventory');
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o estoque.');
      ui.inventoryItems = data.items || []; ui.inventoryMovements = data.movements || []; ui.inventoryLoaded = true;
    } catch (error) {
      if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) ui.inventoryError = error.message || 'Não foi possível conectar ao estoque.';
    } finally {
      if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) {
        ui.inventoryLoading = false;
        const materialForm = document.getElementById('material-form');
        if (materialForm?.elements.source.value === 'STOCK' && materialForm.dataset.sending !== 'true' && materialForm.dataset.outcomeUnknown !== 'true') updateMaterialSource();
        const createForm = document.getElementById('quick-order-form');
        if (createForm) {
          updateCreateStockOptions();
          updateCreateSummary(createForm);
        } else if (['estoque','ordens','servicos'].includes(route()[0])) render();
      }
    }
  }

   function refreshInventoryAfterOrderChange() { ui.inventoryLoaded = false; ui.inventoryError = ''; loadInventory(); }
   function inventoryRows() {
    const query = normalizeSearch(ui.inventoryQuery);
    const items = ui.inventoryItems.filter(item => normalizeSearch(`${item.name} ${item.category || ''}`).includes(query) && (ui.inventoryFilter === 'archived' ? !item.active : item.active) && (ui.inventoryFilter !== 'low' || lowInventory(item)) && (ui.inventoryFilter !== 'tracked' || item.tracked) && (ui.inventoryFilter !== 'catalog' || !item.tracked));
    if (!items.length) return empty(ui.inventoryItems.length ? 'Nenhum item neste filtro.' : 'Seu catálogo começa aqui.',ui.inventoryItems.length ? 'Tente outro nome, categoria ou filtro.' : 'Cadastre uma peça ou material. Informe a quantidade que já tem ou cadastre com zero.');
    return `<table class="inventory-table"><thead><tr><th>Peça / material</th><th>Saldo</th><th>Mínimo</th>${ui.session?.role === 'OWNER' ? '<th>Custo unitário</th>' : ''}<th>Ações</th></tr></thead><tbody>${items.map(item => `<tr><td data-label="Item"><strong>${esc(item.name)}</strong><small>${esc(item.category || 'Sem categoria')} · ${esc(item.unit)}</small>${!item.active ? '<span class="pill">Arquivado</span>' : !item.tracked ? '<span class="pill">Catálogo sem saldo</span>' : lowInventory(item) ? '<span class="pill inventory-low">Baixo estoque</span>' : ''}</td><td data-label="Saldo">${item.tracked ? `${quantityLabel(item.quantity)} ${esc(item.unit)}` : 'Não rastreado'}${item.active && item.tracked && Number(item.quantity) === 0 ? '<small>Registre uma entrada para começar</small>' : ''}</td><td data-label="Mínimo">${item.tracked ? `${quantityLabel(item.minimumQuantity)} ${esc(item.unit)}` : 'Não se aplica'}</td>${ui.session?.role === 'OWNER' ? `<td data-label="Custo">${item.costPrice == null ? 'Não informado' : esc(money(Number(item.costPrice)))}</td>` : ''}<td data-label="Ações"><div class="inventory-actions">${btn('Editar','inventory-edit','','ghost',`data-id="${esc(item.id)}"`)}${item.active && item.tracked ? `${btn('Entrada','inventory-entry','plus','ghost',`data-id="${esc(item.id)}"`)}${btn('Saída','inventory-exit','','ghost',`data-id="${esc(item.id)}"`)}` : ''}</div></td></tr>`).join('')}</tbody></table>`;
  }

  function inventoryPage() {
    const tracked = ui.inventoryItems.filter(item => item.active && item.tracked);
    const title = heading('Peças e Materiais','Controle entradas, saídas e o catálogo da oficina.',`${btn('Histórico','inventory-history-modal','history','ghost')}${btn('Atualizar','inventory-retry','','ghost')}${btn('Cadastrar item','inventory-new','plus','primary')}`);
    if (ui.inventoryError) return `${title}<section class="panel" role="alert"><h2>Estoque indisponível</h2><p class="subtext">${esc(ui.inventoryError)}</p>${btn('Tentar novamente','inventory-retry','','primary')}</section>`;
    if (!ui.inventoryLoaded) return `${title}<section class="panel" aria-busy="true"><p role="status">Carregando peças e materiais...</p></section>`;
    const movementNames = { ENTRY:'Entrada',EXIT:'Saída',CONSUMPTION:'Uso em OS',REVERSAL:'Estorno' };
    return `${title}<div class="inventory-summary"><div><span class="eyebrow">Itens rastreados ativos</span><strong>${tracked.length}</strong></div><div><span class="eyebrow">Baixo estoque</span><strong class="${tracked.some(lowInventory) ? 'inventory-low' : ''}">${tracked.filter(lowInventory).length}</strong><small>Saldo igual ou abaixo do mínimo</small></div></div><section class="table-panel"><div class="table-toolbar inventory-toolbar"><label class="field grow">Buscar peça ou material<input id="inventory-search" type="search" value="${esc(ui.inventoryQuery)}" placeholder="Nome ou categoria"></label><label class="field">Exibir<select id="inventory-filter">${[['active','Todos os ativos'],['low','Baixo estoque'],['tracked','Rastreados'],['catalog','Catálogo sem saldo'],['archived','Arquivados']].map(([value,label]) => `<option value="${value}" ${ui.inventoryFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div id="inventory-results" class="table-wrap">${inventoryRows()}</div></section><section class="panel inventory-history"><div class="section-heading"><h2>Histórico de movimentos</h2><span class="pill">${ui.inventoryMovements.length}</span></div><p class="subtext">Entradas e saídas manuais não são orçamento nem consumo de OS. Registre o uso real dentro da ordem de serviço.</p>${ui.inventoryMovements.length ? `<div class="inventory-events">${[...ui.inventoryMovements].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).map(movement => `<article class="inventory-event"><div class="between wrap"><strong>${esc(movement.itemName)}</strong><span class="pill">${esc(movementNames[movement.type] || movement.type)}</span></div><p>${quantityLabel(movement.quantity)} ${esc(ui.inventoryItems.find(item => String(item.id) === String(movement.itemId))?.unit || '')} · Saldo após: ${quantityLabel(movement.balanceAfter)}</p><p class="subtext">${esc(movement.reason)}</p><small>${esc(movement.userName)} · ${esc(new Date(movement.createdAt).toLocaleString('pt-BR'))}${movement.orderId != null ? ` · OS #${esc(movement.orderId)}` : ''}</small></article>`).join('')}</div>` : empty('Nenhum movimento registrado.','Ao receber materiais, registre uma entrada. O uso confirmado nas OS também aparecerá aqui.')}</section>`;
  }

  function inventoryItemModal(id) {
    if (!inventoryManager()) return;
    const item = id == null ? null : ui.inventoryItems.find(item => String(item.id) === String(id));
    if (id != null && !item) return;
    openModal(item ? 'Editar peça ou material' : 'Cadastrar peça ou material',`<p class="subtext">${item ? 'Unidade e controle de saldo não podem ser alterados. Use Entrada ou Saída para ajustar o saldo. Arquivar preserva o histórico.' : 'Informe a quantidade que já tem ou cadastre com zero. Desmarque o controle de saldo para usar apenas como catálogo.'}</p><form id="inventory-item-form" data-id="${esc(item?.id || '')}" data-operation-id="${crypto.randomUUID()}" data-user-id="${esc(ui.session.id)}" data-generation="${ui.workshopGeneration}" class="form-grid"><label class="field full">Nome<input name="name" value="${esc(item?.name || '')}" required maxlength="120" autofocus></label><label class="field">Categoria<input name="category" value="${esc(item?.category || '')}" maxlength="80"></label>${item ? `<p class="field full">Unidade: ${esc(item.unit)} · ${item.tracked ? 'Saldo rastreado' : 'Catálogo sem saldo'}</p><label class="field">Saldo atual<input value="${item.tracked ? esc(quantityLabel(item.quantity)) : 'Não rastreado'}" readonly></label><label class="checkbox-row field full"><input name="active" type="checkbox" ${item.active ? 'checked' : ''}>Item ativo (desmarque para arquivar)</label>` : `<label class="field">Unidade<select name="unit">${inventoryUnits.map(unit => `<option>${unit}</option>`).join('')}</select></label><label class="checkbox-row field"><input name="tracked" type="checkbox" checked>Controlar saldo em estoque</label><label class="field">Quantidade em estoque<input name="initialQuantity" type="number" min="0" step="0.001" value="0"><small>Informe quanto você já tem. Ex.: 10 reparos.</small></label>`}<label class="field">Estoque mínimo<input name="minimumQuantity" type="number" min="0" step="0.001" value="${esc(item?.minimumQuantity || 0)}" ${item && !item.tracked ? 'disabled' : ''}><small>Somente para itens rastreados.</small></label>${ui.session.role === 'OWNER' ? `<label class="field">Custo unitário (R$)<input name="costPrice" type="number" min="0" step="0.01" value="${esc(item?.costPrice ?? '')}" placeholder="Opcional"></label>` : ''}<p class="field full inventory-form-error" data-inventory-error role="alert"></p></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary" type="submit" form="inventory-item-form">${item ? 'Salvar alterações' : 'Cadastrar item'}</button>`);
  }

  function inventoryMovementModal(id,type) {
    if (!inventoryManager()) return;
    const item = ui.inventoryItems.find(item => String(item.id) === String(id));
    if (!item?.active || !item.tracked) return;
    openModal(type === 'ENTRY' ? 'Registrar entrada' : 'Registrar saída',`<p><strong>${esc(item.name)}</strong> · Saldo: ${quantityLabel(item.quantity)} ${esc(item.unit)}</p><p class="subtext">Movimento manual de estoque, não um orçamento ou consumo de OS. Para uso em serviço, confirme o material na própria OS.</p><form id="inventory-movement-form" data-id="${esc(item.id)}" data-type="${type}" data-operation-id="${crypto.randomUUID()}" data-user-id="${esc(ui.session.id)}" data-generation="${ui.workshopGeneration}" class="form-grid"><label class="field full">Quantidade (${esc(item.unit)})<input name="quantity" type="number" min="0.001" step="0.001" required autofocus></label><label class="field full">Motivo obrigatório<textarea name="reason" required maxlength="1000" placeholder="Ex.: recebimento de compra, perda ou ajuste de contagem"></textarea></label><p class="field full inventory-form-error" data-inventory-error role="alert"></p></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary" type="submit" form="inventory-movement-form">Confirmar ${type === 'ENTRY' ? 'entrada' : 'saída'}</button>`);
  }
  function openInventoryHistoryModal() {
    const names = { ENTRY:'Entrada', EXIT:'Saída', CONSUMPTION:'Uso em OS', REVERSAL:'Estorno' };
    const movements = [...ui.inventoryMovements].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const body = movements.length ? `<p class="subtext">Entradas, saídas, consumos e estornos registrados no estoque desta oficina.</p><div class="inventory-events inventory-history-modal-list">${movements.map(movement => `<article class="inventory-event"><div class="between wrap"><strong>${esc(movement.itemName)}</strong><span class="pill">${esc(names[movement.type] || movement.type)}</span></div><p>${quantityLabel(movement.quantity)} ${esc(ui.inventoryItems.find(item => String(item.id) === String(movement.itemId))?.unit || '')} · Saldo após: ${quantityLabel(movement.balanceAfter)}</p><p class="subtext">${esc(movement.reason)}</p><small>${esc(movement.userName)} · ${esc(new Date(movement.createdAt).toLocaleString('pt-BR'))}</small></article>`).join('')}</div>` : empty('Nenhum movimento registrado','As entradas e saídas do estoque aparecerão aqui.');
    openModal('Histórico de movimentos',body);
    modal.classList.add('inventory-history-modal');
  }

  async function loadOrderMaterials(id) {
    const key = String(id), cached = ui.materialsCache.get(key);
    if (!materialUser() || !remoteOrder(id) || cached?.loaded || cached?.loading || cached?.error) return;
    const requestedUserId = ui.session.id, generation = ui.workshopGeneration;
    const request = { loading:true };
    ui.materialsCache.set(key,request);
    try {
      const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(id)}/materials`);
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      if (ui.materialsCache.get(key) !== request) return;
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os materiais da OS.');
      replaceOrderMaterials(id,data.materials || []);
    } catch (error) {
      if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration && ui.materialsCache.get(key) === request) ui.materialsCache.set(key,{ error:error.message || 'Não foi possível conectar ao servidor.' });
    } finally {
      if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration && String(route()[1]) === key) render();
    }
  }

  function replaceOrderMaterials(id,materials) {
    for (const list of ['serverOrders','closedOrders']) ui[list] = ui[list].map(order => String(order.id) === String(id) ? { ...order,materials } : order);
    ui.materialsCache.set(String(id),{ loaded:true, materials });
  }

  function materialsSection(order) {
    const cached = ui.materialsCache.get(String(order.id)), canAdd = materialUser() && !order.closedAt && order.status !== 3 && order.status !== 4;
    const materials = cached?.materials || order.materials || [];
    const reservations = order.reservations || [];
    const sourceNames = { STOCK:'Estoque',ORDER_PURCHASE:'Compra para esta OS',UNTRACKED:'Sem controle de saldo' };
    return `<section class="panel inventory-history"><div class="section-heading wrap"><h2>Peças reservadas e materiais</h2>${canAdd ? btn('Adicionar peça','order-reserve-material','plus','primary',`data-id="${esc(order.id)}"`) : '<span class="pill">Somente leitura</span>'}</div><p class="subtext">As peças ficam reservadas sem baixa imediata. O uso legado permanece disponível no histórico de materiais.</p>${reservations.length ? `<div class="inventory-events">${reservations.map(item => `<article class="inventory-event"><div class="between wrap"><strong>${esc(item.itemName || item.name || 'Item do estoque')}</strong><span class="pill">${esc(item.status === 'COMMITTED' ? 'Utilizado' : item.status === 'RELEASED' ? 'Liberado' : 'Reservado')}</span></div><p>${quantityLabel(item.quantity)} ${esc(item.unit || '')}</p>${canAdd && item.status === 'ACTIVE' ? btn('Liberar reserva','release-order-reservation','','ghost',`data-id="${esc(order.id)}" data-reservation-id="${esc(item.id)}${item.reservationId || ''}"`) : ''}</article>`).join('')}</div>` : '<p class="subtext">Nenhuma peça reservada.</p>'}${cached?.error ? `<p class="inventory-form-error" role="alert">${esc(cached.error)}</p>${btn('Tentar novamente','materials-retry','','ghost',`data-id="${esc(order.id)}"`)}` : materialUser() && !cached?.loaded ? '<p class="subtext" role="status">Carregando materiais...</p>' : materials.length ? `<div class="inventory-events"><h3>Histórico legado</h3>${materials.map(material => `<article class="inventory-event ${material.status === 'REVERSED' ? 'material-reversed' : ''}"><div class="between wrap"><strong>${esc(material.name)}</strong><span class="pill">${material.status === 'REVERSED' ? 'Estornado' : 'Utilizado'}</span></div><p>${quantityLabel(material.quantity)} ${esc(material.unit)} · ${esc(sourceNames[material.source] || material.source)}</p><small>${esc(material.userName || '')} · ${esc(new Date(material.createdAt).toLocaleString('pt-BR'))}</small>${material.status === 'REVERSED' ? '' : inventoryManager() && canAdd ? btn('Estornar uso','material-reverse','','ghost',`data-id="${esc(order.id)}" data-material-id="${esc(material.id)}"`) : ''}</article>`).join('')}</div>` : ''}</section>`;
  }
  function reservationModal(id) {
    const order = remoteOrder(id); if (!order || !materialUser() || order.closedAt || order.status === 3 || order.status === 4) return;
    openModal('Adicionar peça',`<p class="subtext">Reserve a quantidade para esta OS sem movimentar o estoque.</p><form id="order-reservation-form" data-id="${esc(id)}" data-operation-id="${crypto.randomUUID()}"><label class="field">Item do estoque<select name="itemId" required>${createItemOptions()}</select></label><label class="field">Quantidade<input name="quantity" type="number" min="0.001" step="0.001" required></label><p class="inventory-form-error" data-inventory-error role="alert"></p></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary" type="submit" form="order-reservation-form">Reservar peça</button>`);
  }
  async function releaseOrderReservation(id,reservationId) {
    try { const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(id)}/reservations/${encodeURIComponent(reservationId)}`,{ method:'DELETE',body:{ operationId:crypto.randomUUID(),reason:'Liberada pela oficina' } }); if (!response.ok) throw new Error(data.error || 'Não foi possível liberar a reserva.'); ui.serverOrders = ui.serverOrders.map(order => String(order.id) === String(id) ? { ...order,reservations:data.reservations || [] } : order); render(); toast('Reserva liberada.'); }
    catch (error) { toast(error.message || 'Não foi possível liberar a reserva.',true); }
  }

  function materialModal(id,materialId) {
    const order = remoteOrder(id);
    if (!materialUser() || !order || order.closedAt || order.status === 3 || (materialId && !inventoryManager())) return;
    if (materialId) {
      const material = (ui.materialsCache.get(String(id))?.materials || order.materials || []).find(item => String(item.id) === String(materialId));
      if (!material || material.status === 'REVERSED') return;
      openModal('Estornar material utilizado',`<p>${esc(material.name)} · ${quantityLabel(material.quantity)} ${esc(material.unit)}</p><p class="subtext">O estorno devolve o saldo apenas quando a origem é estoque. O registro original permanece no histórico.</p><form id="material-reverse-form" data-id="${esc(id)}" data-material-id="${esc(materialId)}" data-operation-id="${crypto.randomUUID()}" data-user-id="${esc(ui.session.id)}" data-generation="${ui.workshopGeneration}"><label class="field">Motivo obrigatório<textarea name="reason" required maxlength="1000" autofocus></textarea></label><p class="inventory-form-error" data-inventory-error role="alert"></p></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn danger" form="material-reverse-form" type="submit">Confirmar estorno</button>`);
      return;
    }
    openModal('Confirmar uso de material',`<p class="subtext">Não é orçamento: confirme somente a quantidade usada. Estoque será baixado ao confirmar. Compras para esta OS e itens não rastreados não geram baixa.</p><form id="material-form" data-id="${esc(id)}" data-operation-id="${crypto.randomUUID()}" data-user-id="${esc(ui.session.id)}" data-generation="${ui.workshopGeneration}" class="form-grid"><label class="field full">Origem<select name="source" id="material-source"><option value="STOCK">Estoque da oficina</option><option value="ORDER_PURCHASE">Compra para esta OS (sem baixa)</option><option value="UNTRACKED">Material não rastreado (sem baixa)</option></select></label><div id="material-source-fields" class="field full"></div><label class="field full">Quantidade utilizada<input name="quantity" type="number" min="0.001" step="0.001" required></label><p class="field full inventory-form-error" data-inventory-error role="alert"></p></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary" form="material-form" type="submit">Confirmar uso real</button>`);
    updateMaterialSource();
  }

  function updateMaterialSource() {
    const form = document.getElementById('material-form'); if (!form) return;
    const source = form.elements.source.value, field = document.getElementById('material-source-fields');
    const items = ui.inventoryItems.filter(item => item.active && item.tracked === (source === 'STOCK'));
    if (source === 'STOCK') {
      field.innerHTML = ui.inventoryError ? `<p role="alert">${esc(ui.inventoryError)}</p>${btn('Tentar carregar estoque','inventory-retry','','ghost')}` : !ui.inventoryLoaded ? '<p role="status">Carregando estoque. Feche e abra este formulário após o carregamento.</p>' : items.length ? `<label class="field">Item do estoque<select name="itemId" required><option value="">Selecione uma peça ou material</option>${items.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · ${quantityLabel(item.quantity)} ${esc(item.unit)}</option>`).join('')}</select><small>A quantidade usada não pode exceder o saldo disponível.</small></label>` : '<p>Nenhum item rastreado ativo. Cadastre e registre uma entrada na área Estoque ou escolha outra origem.</p>';
    } else {
      field.innerHTML = `${source === 'UNTRACKED' ? `<label class="field">Catálogo (opcional)<select name="itemId" id="material-catalog"><option value="">Informar material livre</option>${items.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.unit)}</option>`).join('')}</select></label>` : ''}<label class="field">Nome do material<input name="name" required maxlength="120"></label><label class="field">Unidade<select name="unit">${inventoryUnits.map(unit => `<option>${unit}</option>`).join('')}</select></label>`;
    }
  }

  async function submitInventoryForm(form,values) {
    if (form.dataset.sending === 'true' || String(ui.session?.id) !== form.dataset.userId || Number(form.dataset.generation) !== ui.workshopGeneration) return;
    const requestedUserId = ui.session.id, generation = ui.workshopGeneration, id = form.dataset.id;
    const isItem = form.id === 'inventory-item-form', isMovement = form.id === 'inventory-movement-form', isReverse = form.id === 'material-reverse-form';
    const errorField = form.querySelector('[data-inventory-error]');
    const fail = message => { errorField.textContent = message; };
    if ((isItem || isMovement || isReverse) && !inventoryManager() || !materialUser()) return;
    if (!form.inventorySubmission && !isItem && !isMovement && (!remoteOrder(id) || remoteOrder(id).closedAt || remoteOrder(id).status === 3)) return fail('Esta OS está encerrada. Materiais estão disponíveis somente para consulta.');
    let path, method = 'POST', body;
    if (form.inventorySubmission) ({ path,method,body } = form.inventorySubmission);
    else if (isItem) {
      body = { name:values.name,category:values.category || '',minimumQuantity:Number(values.minimumQuantity || 0) };
      if (ui.session.role === 'OWNER' && (id || values.costPrice !== '')) body.costPrice = Number(values.costPrice || 0);
      if (!body.name || !Number.isFinite(body.minimumQuantity) || body.minimumQuantity < 0 || body.costPrice != null && (!Number.isFinite(body.costPrice) || body.costPrice < 0)) return fail('Informe nome, mínimo e custo válidos, sem valores negativos.');
      if (id) { method = 'PATCH'; body.active = form.elements.active.checked; path = `/api/inventory/items/${encodeURIComponent(id)}`; }
      else {
        body.unit = values.unit; body.tracked = form.elements.tracked.checked;
        body.initialQuantity = body.tracked ? Number(values.initialQuantity || 0) : 0;
        if (!Number.isFinite(body.initialQuantity) || body.initialQuantity < 0) return fail('Informe uma quantidade em estoque válida, sem valores negativos.');
        body.operationId = form.dataset.operationId; path = '/api/inventory/items';
      }
    } else {
      body = { ...values,operationId:form.dataset.operationId };
      if (isReverse) { if (!body.reason) return fail('Informe o motivo do estorno.'); path = `/api/orders/${encodeURIComponent(id)}/materials/${encodeURIComponent(form.dataset.materialId)}/reverse`; }
      else {
        body.quantity = Number(values.quantity);
        if (!Number.isFinite(body.quantity) || body.quantity <= 0) return fail('Informe uma quantidade positiva.');
        if (isMovement) {
          if (!body.reason) return fail('Informe o motivo do movimento.');
          body.itemId = id; body.type = form.dataset.type; path = '/api/inventory/movements';
        } else {
          if (body.source === 'STOCK' && !body.itemId) return fail('Selecione um item de estoque ou escolha outra origem.');
          if (!body.itemId) delete body.itemId;
          if (body.source === 'UNTRACKED' && body.itemId) {
            const catalogItem = ui.inventoryItems.find(item => String(item.id) === String(body.itemId) && item.active && !item.tracked);
            if (!catalogItem) return fail('Escolha um item ativo não rastreado ou informe um material livre.');
            body.name = catalogItem.name; body.unit = catalogItem.unit;
          }
          if (body.source !== 'STOCK' && !body.name) return fail('Informe o nome do material.');
          if (body.source === 'STOCK') { delete body.name; delete body.unit; }
          path = `/api/orders/${encodeURIComponent(id)}/materials`;
        }
        if (isMovement && body.type === 'EXIT' || !isMovement && body.source === 'STOCK') {
          const item = ui.inventoryItems.find(item => String(item.id) === String(body.itemId));
          if (item && body.quantity > Number(item.quantity)) return fail('Quantidade acima do saldo disponível. Atualize o estoque e tente novamente.');
        }
      }
    }
    // A lost response may hide a committed operation. Retry the exact request.
    form.inventorySubmission = { path,method,body };
    form.dataset.sending = 'true'; errorField.textContent = '';
    const controls = [...form.querySelectorAll('input,select,textarea,button'),...modal.querySelectorAll('.modal-footer button,.modal-header button')];
    const previousDisabled = form.inventoryDisabledControls || new Map(controls.map(control => [control,control.disabled]));
    form.inventoryDisabledControls = previousDisabled;
    controls.forEach(control => { control.disabled = true; }); form.setAttribute('aria-busy','true');
    let responseReceived = false;
    try {
      const { response,data } = await apiRequest(path,{ method,body });
      responseReceived = true;
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      if (!response.ok) {
        const conflict = response.status === 409 && /operationId|idempot/i.test(data.error || '');
        form.dataset.outcomeUnknown = String(conflict);
        if (!conflict) form.inventorySubmission = null;
        throw new Error(conflict ? 'Conflito no identificador da operação. Não crie outra operação; confira o histórico antes de prosseguir.' : data.error || 'Não foi possível salvar. Revise os dados e tente novamente.');
      }
      if (isItem || isMovement) {
        if (data.item) ui.inventoryItems = [data.item,...ui.inventoryItems.filter(item => String(item.id) !== String(data.item.id))];
      } else replaceOrderMaterials(id,data.materials || []);
      ui.inventoryLoaded = false; ui.inventoryError = '';
      form.dataset.sending = 'false'; form.dataset.outcomeUnknown = 'false'; form.inventorySubmission = null;
      closeModal(); render(); loadInventory();
      toast(isItem ? id ? 'Item atualizado.' : 'Item cadastrado.' : isMovement ? 'Movimento registrado.' : isReverse ? 'Uso estornado.' : 'Uso de material confirmado.');
    } catch (error) {
      if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) {
        if (!responseReceived) form.dataset.outcomeUnknown = 'true';
        fail(responseReceived ? error.message : 'Envio não confirmado: a operação pode já ter sido registrada. Os dados estão bloqueados. Clique novamente em confirmar para consultar ou repetir a mesma operação, sem duplicar.');
      }
    } finally {
      form.dataset.sending = 'false'; form.removeAttribute('aria-busy');
      controls.forEach(control => { control.disabled = form.dataset.outcomeUnknown === 'true' ? !(control.form === form && control.matches('button[type="submit"]')) : previousDisabled.get(control); });
      if (form.dataset.outcomeUnknown !== 'true') form.inventoryDisabledControls = null;
    }
  }

  async function registerVehicleFromOrder(form) {
    const id = form.dataset.id, values = Object.fromEntries(new FormData(form));
    const requestedUserId = ui.session?.id, generation = ui.workshopGeneration;
    values.year = Number(values.year); values.mileage = Number(values.mileage || 0);
    try {
      const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(id)}/register-vehicle`,{ method:'POST',body:values });
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      if (!response.ok) throw new Error(data.error || 'Não foi possível cadastrar o veículo.');
      ui.serverOrders = ui.serverOrders.map(item => item.id === data.order.id ? data.order : item);
      ui.workshopClients.push(data.client); ui.workshopVehicles.push(data.vehicle);
      render(); toast(`Veículo ${data.vehicle.plate} cadastrado e vinculado à OS #${id}.`);
    } catch (error) { if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) toast(error.message || 'Não foi possível cadastrar o veículo.',true); }
  }


  function quickOrderCard(order) {
    const status = statuses[Number(order.status)] || statuses[0];
    const vehicleLabel = [order.vehicleBrand,order.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado';
    return `<a class="work-card" href="#/ordens/${order.id}"><div class="between"><span class="eyebrow">OS #${order.id}</span>${badge(Number(order.status) || 0)}</div><h2>${esc(vehicleLabel)}</h2><div class="between">${order.plate ? plate(order.plate) : '<span class="muted">Placa não informada</span>'}<span class="badge" style="--status:#fbbf24">${order.incomplete ? 'Cadastro incompleto' : 'Cadastro completo'}</span></div><div class="work-service"><span class="eyebrow">Cliente</span><p>${esc(order.clientName || 'Não informado')}${order.phone ? ` · ${esc(order.phone)}` : ''}</p><span class="eyebrow">Problema relatado</span><p class="subtext">${esc(order.issue || 'Ainda não informado')}</p></div><span class="btn primary large full">Ver serviço ${icon('arrow')}</span></a>`;
  }

  function closedOrdersSection() {
    const localOrders = state.orders.filter(order => order.status === 3 || order.closedAt);
    const remoteOrders = ui.closedOrders || [];
    const rows = [
      ...remoteOrders.map(order => ({ id:order.id, plate:order.plate || 'Placa não informada', vehicle:[order.vehicleBrand,order.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado', client:order.clientName || 'Cliente não informado', mechanic:order.assignedUserName || 'Não atribuído', closedAt:order.closedAt, remote:true })),
      ...localOrders.map(order => { const v=vehicle(order.vehicle), c=client(v.client), m=member(order.mechanic); return { id:order.id, plate:v.plate, vehicle:`${v.brand} ${v.model}`, client:c.name, mechanic:m.name, closedAt:order.closedAt, remote:false }; })
    ];
    if (!rows.length) return `<section class="panel"><h2>OS encerradas</h2>${empty('Nenhuma OS entregue ou encerrada.','As ordens permanecerão disponíveis aqui depois da entrega.')}</section>`;
    return `<section class="panel"><div class="section-heading"><h2>OS encerradas</h2><span class="pill">${rows.length}</span></div><div class="entity-grid">${rows.map(row => `<a class="panel closed-order-row" href="#/ordens/${row.id}"><div class="between"><strong>OS #${row.id}</strong><span class="badge" style="--status:#94a3b8">Entregue</span></div><p>${esc(row.vehicle)} · ${esc(row.plate)}</p><p class="subtext">Cliente: ${esc(row.client)} · Mecânico: ${esc(row.mechanic)}</p><small>Criada e entregue ${row.closedAt ? new Date(row.closedAt).toLocaleString('pt-BR') : ''}</small></a>`).join('')}</div></section>`;
  }

  function closedLocalOrderPage(id) {
    const o = order(id); if (!o || !(o.status === 3 || o.closedAt)) return notFound();
    const v=vehicle(o.vehicle), c=client(v.client), m=member(o.mechanic);
    return `${heading(`OS #${o.id}`,'Ordem encerrada · Consulta somente leitura.',`<a class="btn ghost" href="#/historico">${icon('left')}Voltar ao Histórico</a>`)}<section class="panel"><div class="between"><h2>${esc(v.brand)} ${esc(v.model)}</h2><span class="badge" style="--status:#94a3b8">Entregue / Encerrada</span></div><p>${plate(v.plate)} · ${esc(c.name)} · Mecânico: ${esc(m.name)}</p><p class="subtext">Problema: ${esc(o.issue || 'Não informado')}</p><p class="subtext">Criada: ${esc(o.entry || '')} · Entregue: ${o.closedAt ? new Date(o.closedAt).toLocaleString('pt-BR') : 'Data não registrada'}</p><div class="divider"></div><h3>Histórico</h3>${(o.history || []).map(entry => `<p class="subtext">${esc(entry.text)} · ${esc(entry.date)}</p>`).join('')}</section>`;
  }

  async function deliverServerOrder(id) {
    try {
      const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(id)}/deliver`,{ method:'POST' });
      if (!response.ok) throw new Error(data.error || 'Não foi possível encerrar a OS.');
      ui.serverOrders = ui.serverOrders.filter(order => order.id !== data.order.id);
      ui.closedOrders.unshift(data.order);
      render(); toast(data.message || `OS #${id} entregue.`);
    } catch (error) { toast(error.message || 'Não foi possível encerrar a OS.',true); }
  }
  function confirmServerDelivery(id) {
    const item = remoteOrder(id);
    if (!item) return;
    const vehicleLabel = [item.vehicleBrand,item.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado';
    const value = item.estimatedValue ?? item.totals?.total;
    openModal('Confirmar entrega do veículo?',`<div class="delivery-summary"><div><span>Cliente</span><strong>${esc(item.clientName || 'Não informado')}</strong></div><div><span>Veículo</span><strong>${esc(vehicleLabel)}</strong></div><div><span>Placa</span><strong>${esc(item.plate || 'Não informada')}</strong></div><div><span>Ordem de Serviço</span><strong>#${esc(item.id)}</strong></div>${value != null ? `<div><span>Valor final</span><strong>${esc(money(Number(value)))}</strong></div>` : ''}</div><p class="subtext">A OS será encerrada, registrada no Histórico e sairá das ordens ativas.</p>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary" type="button" data-action="confirm-delivery" data-id="${esc(id)}">Confirmar entrega</button>`);
  }

  async function reopenServerOrder(id) {
    try {
      const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(id)}`,{ method:'PATCH',body:{ reopen:true } });
      if (!response.ok) throw new Error(data.error || 'Não foi possível reabrir a OS.');
      ui.closedOrders = ui.closedOrders.filter(order => order.id !== data.order.id);
      ui.serverOrders.unshift(data.order);
      render(); toast(`OS #${id} reaberta.`);
    } catch (error) { toast(error.message || 'Não foi possível reabrir a OS.',true); }
  }
  async function cancelServerOrder(id) {
    try { const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(id)}/cancel`,{ method:'POST' }); if (!response.ok) throw new Error(data.error || 'Não foi possível cancelar a OS.'); ui.serverOrders = ui.serverOrders.filter(order => String(order.id) !== String(id)); ui.closedOrders.unshift(data.order); render(); toast(`OS #${id} cancelada.`); }
    catch (error) { toast(error.message || 'Não foi possível cancelar a OS.',true); }
  }

  function deliverLocalOrder(id) {
    const o = order(id);
    if (!o || o.status !== 2) return toast('Somente uma OS Pronta pode ser entregue.',true);
    const at = new Date().toISOString();
    o.statusBeforeClose = o.status; o.status = 3; o.closedAt = at; o.closedBy = ui.session?.id; o.closedByName = ui.session?.name;
    o.history ||= []; o.history.push({ text:`Veículo da OS #${o.id} entregue; OS encerrada.`,date:new Date(at).toLocaleString('pt-BR'),userId:ui.session?.id });
    save(); render(); toast(`OS #${id} entregue e movida ao Histórico.`);
  }

  function activeLocalOrderDetailPage(id) {
    const o = order(id);
    const canDeliver = o?.status === 2 && ['OWNER','MANAGER','ATTENDANT'].includes(ui.session?.role);
    return `${detailPage(id)}${canDeliver ? `<div class="panel delivery-action">${btn('Entregar veículo','deliver-local-order','check','primary large',`data-id="${id}"`)}</div>` : ''}`;
  }

   function quickOrdersSection(orders = ui.serverOrders) {
      return `<div id="quick-orders-results">${orders.length ? `<section class="order-cards-section"><div class="work-grid">${orders.map(quickOrderCard).join('')}</div></section>` : empty('Nenhuma Ordem de Serviço cadastrada.','Crie uma nova OS para começar o atendimento.')}</div>`;
  }

  function closedOrdersSection() {
    const remote = ui.closedOrders.map(order => ({ id:order.id, plate:order.plate || 'Placa não informada', vehicle:[order.vehicleBrand,order.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado', client:order.clientName || 'Cliente não informado', mechanic:order.assignedUserName || 'Não atribuído', closedAt:order.closedAt }));
    const local = state.orders.filter(order => order.status === 3 || order.closedAt).map(order => { const v=vehicle(order.vehicle), c=client(v.client), m=member(order.mechanic); return { id:order.id, local:true, plate:v.plate, vehicle:`${v.brand} ${v.model}`, client:c.name, mechanic:m.name, closedAt:order.closedAt }; });
    const rows = [...remote,...local];
    return `<section class="panel"><div class="section-heading"><h2>Ordens entregues / encerradas</h2><span class="pill">${rows.length}</span></div>${rows.length ? `<div class="entity-grid">${rows.map(row => `<a class="panel closed-order-row" href="#/ordens/${row.local ? 'local-' : ''}${row.id}"><div class="between"><strong>OS #${row.id}</strong><span class="badge" style="--status:#94a3b8">Entregue</span></div><p>${esc(row.vehicle)} · ${esc(row.plate)}</p><p class="subtext">Cliente: ${esc(row.client)} · Mecânico: ${esc(row.mechanic)}</p><small>Entregue ${row.closedAt ? new Date(row.closedAt).toLocaleString('pt-BR') : ''}</small></a>`).join('')}</div>` : empty('Nenhuma OS encerrada.','As ordens entregues permanecem consultáveis aqui.')}</section>`;
  }

  function quickOrderDetail(id) {
    const item = ui.serverOrders.find(order => String(order.id) === String(id));
    if (!item) return notFound();
    const mechanic = ui.session?.role === 'MECHANIC';
    const assigned = ui.teamMembers.find(user => user.id === item.assignedUserId);
    return `${heading(`OS #${item.id}`,`Criada em ${new Date(item.entryAt).toLocaleString('pt-BR')}`,`<a class="btn ghost" href="#/servicos">${icon('left')}Voltar</a>`)}<section class="panel"><div class="between"><h2>Entrada</h2><span class="badge" style="--status:${statuses[item.status]?.color || '#9ca3af'}">${statuses[item.status]?.name || 'Entrada'}</span></div>${item.incomplete ? '<p class="integration-note">Cadastro incompleto · você pode completar as informações depois.</p>' : ''}<form id="quick-order-edit-form" data-id="${item.id}" class="form-grid"><label class="field">Cliente<input name="clientName" maxlength="120" value="${esc(item.clientName)}"></label><label class="field">Telefone<input name="phone" type="tel" inputmode="tel" maxlength="30" value="${esc(item.phone)}"></label><label class="field">Marca<input name="vehicleBrand" maxlength="60" value="${esc(item.vehicleBrand)}"></label><label class="field">Modelo<input name="vehicleModel" maxlength="120" value="${esc(item.vehicleModel)}"></label><label class="field">Placa<input name="plate" maxlength="10" style="text-transform:uppercase" value="${esc(item.plate)}"></label><label class="field full">Problema relatado<textarea name="issue" maxlength="2000">${esc(item.issue)}</textarea></label>${!mechanic && ['OWNER','MANAGER'].includes(ui.session?.role) ? `<label class="field full">Mecânico responsável<select name="assignedUserId"><option value="">Sem atribuição</option>${ui.teamMembers.filter(user => user.role === 'MECHANIC' && user.status === 'ACTIVE').map(user => `<option value="${esc(user.id)}" ${item.assignedUserId === user.id ? 'selected' : ''}>${esc(user.name)}</option>`).join('')}</select></label>` : `<p class="field full">Responsável: ${esc(assigned?.name || (item.assignedUserId === ui.session?.id ? ui.session.name : 'Não atribuído'))}</p>`}<div class="field full"><button class="btn primary large full" type="submit">Salvar alterações</button></div></form><div class="divider"></div><h3>Histórico</h3>${(item.history || []).map(entry => `<p class="subtext">${esc(entry.action)} · ${new Date(entry.at).toLocaleString('pt-BR')}</p>`).join('')}</section>`;
  }

  function quickServerOrderDetail(id) {
    const item = ui.serverOrders.find(order => String(order.id) === String(id));
    if (!item) return notFound();
    const manager = ['OWNER','MANAGER'].includes(ui.session?.role);
    const assigned = item.assignedUserName || (item.assignedUserId === ui.session?.id ? ui.session.name : 'Não atribuído');
    return `${heading(`OS #${item.id}`,`Criada em ${new Date(item.entryAt).toLocaleString('pt-BR')}`,`<a class="btn ghost" href="#/${ui.session?.role === 'MECHANIC' ? 'servicos' : 'ordens'}">${icon('left')}Voltar</a>`)}<section class="panel"><div class="between"><h2>${statuses[item.status]?.name || 'Entrada'}</h2>${badge(item.status)}</div>${item.incomplete ? '<p class="integration-note">Cadastro incompleto · complete as informações quando necessário.</p>' : ''}<form id="quick-order-edit-form" data-id="${item.id}" class="form-grid"><label class="field">Cliente<input name="clientName" maxlength="120" value="${esc(item.clientName)}"></label><label class="field">Telefone<input name="phone" type="tel" inputmode="tel" maxlength="30" value="${esc(item.phone)}"></label><label class="field">Marca<input name="vehicleBrand" maxlength="60" value="${esc(item.vehicleBrand)}"></label><label class="field">Modelo<input name="vehicleModel" maxlength="120" value="${esc(item.vehicleModel)}"></label><label class="field">Placa<input name="plate" maxlength="10" style="text-transform:uppercase" value="${esc(item.plate)}"></label><label class="field full">Problema relatado<textarea name="issue" maxlength="2000">${esc(item.issue)}</textarea></label>${manager ? `<label class="field">Status<select name="status">${statuses.map((status,index) => `<option value="${index}" ${item.status === index ? 'selected' : ''}>${status.name}</option>`).join('')}</select></label><label class="field">Mecânico responsável<select name="assignedUserId"><option value="">Sem atribuição</option>${ui.teamMembers.filter(user => user.role === 'MECHANIC' && user.status === 'ACTIVE').map(user => `<option value="${esc(user.id)}" ${item.assignedUserId === user.id ? 'selected' : ''}>${esc(user.name)}</option>`).join('')}</select></label>` : `<p class="field full">Mecânico responsável: ${esc(assigned)}</p>`}<div class="field full"><button class="btn primary large full" type="submit">Salvar alterações</button></div></form><div class="divider"></div><h3>Histórico</h3>${(item.history || []).map(entry => `<p class="subtext">${esc(entry.text || entry.action)} · ${new Date(entry.at).toLocaleString('pt-BR')}</p>`).join('')}</section>`;
  }

  function printOrder(id) {
    const item = [...ui.serverOrders,...ui.closedOrders].find(order => String(order.id) === String(id));
    if (!item) return toast('Não foi possível encontrar esta OS.',true);
    const vehicleLabel = [item.vehicleBrand,item.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado';
    const labor = item.laborItems || [], materials = (item.materials || []).filter(material => material.status !== 'REVERSED');
    const totals = item.totals || { parts:0, labor:labor.reduce((sum,line) => sum + Number(line.value || 0),0), discount:Number(item.discount || 0), total:0 };
    const total = Number(totals.total || Math.max(0,Number(totals.parts || 0) + Number(totals.labor || 0) - Number(totals.discount || 0)));
    const popup = window.open('', '_blank', 'width=900,height=900');
    if (!popup) return toast('Permita janelas pop-up para imprimir a OS.',true);
    const list = (rows, emptyText) => rows.length ? `<table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Valor</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.description || row.name)}</td><td>${esc(row.quantity || 1)}</td><td>${money(Number(row.value || 0) * Number(row.quantity || 1))}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">${emptyText}</p>`;
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>OS #${esc(item.id)} - GIRO</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#17202a;background:#fff;font-size:12px}.sheet{max-width:780px;margin:0 auto}.head{display:flex;justify-content:space-between;gap:20px;padding-bottom:20px;border-bottom:3px solid #0ea5e9}.brand{font-size:28px;font-weight:900;font-style:italic;letter-spacing:2px;color:#0b82bd}.head h1{font-size:22px;margin:0 0 6px}.muted{color:#617080}.status{display:inline-block;padding:5px 10px;border-radius:20px;background:#e8f3f8;color:#0b6d9c;font-weight:700;font-size:11px}.section{margin-top:20px;border:1px solid #d9e1e8;border-radius:8px;padding:15px}.section h2{font-size:14px;margin:0 0 12px;color:#0b6d9c}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.label{display:block;color:#687786;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}.value{font-weight:700}.problem{line-height:1.6;white-space:pre-wrap}.rowline{display:flex;justify-content:space-between;gap:15px;padding:8px 0;border-bottom:1px solid #e6ebef}.rowline:last-child{border-bottom:0}table{width:100%;border-collapse:collapse}th{text-align:left;background:#eef4f7;color:#526373;font-size:10px;text-transform:uppercase;padding:8px}td{padding:9px 8px;border-bottom:1px solid #e6ebef}th:last-child,td:last-child{text-align:right}.totals{margin-left:auto;max-width:300px;margin-top:15px}.total{font-size:17px;color:#0b6d9c;border-top:2px solid #0ea5e9;padding-top:10px;margin-top:6px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:55px}.signature{border-top:1px solid #526373;padding-top:8px;text-align:center;color:#617080}.footer{margin-top:35px;text-align:center;font-size:10px;color:#7a8792}@media(max-width:600px){.grid,.signatures{grid-template-columns:1fr}.head{display:block}.head>div:last-child{margin-top:15px}.section{padding:12px}}@media print{.no-print{display:none}}</style></head><body><main class="sheet"><header class="head"><div><div class="brand">GIRO</div><p class="muted">Ordem de Serviço</p></div><div><h1>OS #${esc(item.id)}</h1><span class="status">${item.closedAt ? 'Entregue' : statuses[item.status]?.name || 'Entrada'}</span><p class="muted">Entrada: ${esc(displayUpdatedAt(item.entryAt))}</p>${item.closedAt ? `<p class="muted">Conclusão: ${esc(displayUpdatedAt(item.closedAt))}</p>` : ''}</div></header><section class="section"><h2>Cliente e veículo</h2><div class="grid"><div><span class="label">Cliente</span><span class="value">${esc(item.clientName || 'Não informado')}</span></div><div><span class="label">Telefone</span><span class="value">${esc(item.phone || 'Não informado')}</span></div><div><span class="label">Veículo</span><span class="value">${esc(vehicleLabel)}</span></div><div><span class="label">Placa</span><span class="value">${esc(item.plate || 'Não informada')}</span></div><div><span class="label">Quilometragem</span><span class="value">${esc(item.mileage || 0)} km</span></div><div><span class="label">Mecânico</span><span class="value">${esc(item.assignedUserName || 'Não atribuído')}</span></div></div></section><section class="section"><h2>Serviço</h2><p class="problem"><strong>Problema relatado:</strong> ${esc(item.issue || 'Não informado')}</p><p class="problem"><strong>Serviço:</strong> ${esc(item.service || 'Não informado')}</p></section><section class="section"><h2>Mão de obra</h2>${list(labor.map(line => ({...line,name:line.description})), 'Nenhuma mão de obra registrada.')}</section><section class="section"><h2>Peças e materiais</h2>${list(materials.map(line => ({...line,name:line.name,value:0})), 'Nenhuma peça ou material registrado.')}</section><section class="section"><h2>Resumo financeiro</h2><div class="totals"><div class="rowline"><span>Peças</span><strong>${money(Number(totals.parts || 0))}</strong></div><div class="rowline"><span>Mão de obra</span><strong>${money(Number(totals.labor || 0))}</strong></div><div class="rowline"><span>Desconto</span><strong>${money(Number(totals.discount || item.discount || 0))}</strong></div><div class="rowline total"><span>Total estimado</span><strong>${money(total)}</strong></div></div></section><div class="signatures"><div class="signature">Responsável pela oficina</div><div class="signature">Cliente</div></div><p class="footer">Documento gerado pelo GIRO · ${esc(new Date().toLocaleString('pt-BR'))}</p></main></body></html>`);
    popup.document.close(); popup.focus(); setTimeout(() => popup.print(),300);
  }
  function serviceOrderDetailPage(id) {
    const item = [...ui.serverOrders,...ui.closedOrders].find(order => String(order.id) === String(id));
    const cancel = item && ['OWNER','MANAGER'].includes(ui.session?.role) && !item.closedAt && item.status !== 3 && item.status !== 4 ? `<section class="panel delivery-action">${btn('Cancelar OS','cancel-server-order','close','danger',`data-id="${esc(id)}"`)}</section>` : '';
    return serviceOrderDetailContent(id) + (item ? `<section class="panel print-order-action">${btn('Imprimir OS para o cliente','print-order','download','ghost',`data-id="${esc(id)}"`)}</section>${orderStructuredSections(item)}${materialsSection(item)}${legacyMaterialSection(item)}${cancel}` : '');
  }
  function legacyMaterialSection(item) {
    const materials = item.materials || [], active = !item.closedAt && item.status !== 3 && item.status !== 4;
    return `<section class="panel inventory-history legacy-material-actions"><div class="section-heading wrap"><h2>Materiais utilizados</h2>${active && materialUser() ? btn('Confirmar uso','material-new','plus','ghost',`data-id="${esc(item.id)}"`) : ''}</div>${materials.length ? `<p class="subtext">${materials.length} registro(s) de uso real.</p>` : '<p class="subtext">Nenhum material utilizado.</p>'}</section>`;
  }
  function orderStructuredSections(item) {
    const mechanic = item.assignedUserName || 'Não atribuído', vehicleLabel = [item.vehicleBrand,item.vehicleModel].filter(Boolean).join(' ') || 'Não informado';
    const labor = item.laborItems || [], pending = item.pendingItems || [], totals = item.totals || {};
    return `<section class="order-detail-sections"><details class="panel order-detail-section" open><summary>Cliente e veículo</summary><div class="detail-grid"><span><small>Cliente</small><strong>${esc(item.clientName || 'Não informado')}</strong></span><span><small>Telefone</small><strong>${esc(item.phone || 'Não informado')}</strong></span><span><small>Veículo</small><strong>${esc(vehicleLabel)}</strong></span><span><small>Placa</small><strong>${esc(item.plate || 'Não informada')}</strong></span><span><small>Ano / quilometragem</small><strong>${esc(item.year || '—')} · ${quantityLabel(item.mileage)} km</strong></span></div></details><details class="panel order-detail-section" open><summary>Serviço</summary><p><strong>Problema:</strong> ${esc(item.issue || 'Não informado')}</p><p><strong>Serviço:</strong> ${esc(item.service || 'Não informado')}</p><p class="subtext">Mecânico: ${esc(mechanic)} · Prioridade: ${esc(item.priority || 'Normal')}${item.dueAt ? ` · Prazo: ${esc(displayUpdatedAt(item.dueAt))}` : ''}</p></details><details class="panel order-detail-section" open><summary>Peças / Itens</summary>${pending.length ? `<div class="pending-items">${pending.map(part => `<span class="pill">Pendente de peça · ${esc(part.name)} · ${quantityLabel(part.quantity)} ${esc(part.unit)}</span>`).join('')}</div>` : '<p class="subtext">Nenhum item pendente.</p>'}</details><details class="panel order-detail-section" open><summary>Mão de obra</summary>${labor.length ? labor.map(line => `<div class="between wrap"><span>${esc(line.description)}</span><strong>${money(line.value)}</strong></div>`).join('') : '<p class="subtext">Nenhuma mão de obra informada.</p>'}</details><details class="panel order-detail-section" open><summary>Resumo financeiro</summary><div class="detail-grid"><span><small>Peças</small><strong>${money(totals.parts)}</strong></span><span><small>Mão de obra</small><strong>${money(totals.labor)}</strong></span><span><small>Desconto</small><strong>${money(totals.discount)}</strong></span><span><small>Total</small><strong>${money(totals.total ?? item.estimatedValue)}</strong></span></div></details><details class="panel order-detail-section"><summary>Histórico</summary>${(item.history || []).map(entry => `<p class="subtext">${esc(entry.text || entry.action || 'Atualização')} · ${esc(entry.at || entry.date || '')}</p>`).join('') || '<p class="subtext">Nenhum evento registrado.</p>'}</details></section>`;
  }

  function serviceOrderDetailContent(id) {
    const item = [...ui.serverOrders,...ui.closedOrders].find(order => String(order.id) === String(id));
    if (!item) return notFound();
    const closed = Boolean(item.closedAt) || item.status === 3, manager = ['OWNER','MANAGER'].includes(ui.session?.role);
     const canDeliver = ['OWNER','MANAGER','ATTENDANT','MECHANIC'].includes(ui.session?.role) && !closed && item.status === 2;
    const assigned = item.assignedUserName || (item.assignedUserId === ui.session?.id ? ui.session.name : 'Não atribuído');
    const disabled = closed ? 'disabled' : '';
    return `${heading(`OS #${item.id}`,`Criada em ${new Date(item.entryAt).toLocaleString('pt-BR')}`,`<a class="btn ghost" href="#/${ui.session?.role === 'MECHANIC' ? 'historico' : closed ? 'historico' : 'ordens'}">${icon('left')}Voltar</a>`)}<section class="panel"><div class="between"><h2>${closed ? 'Entregue / Encerrada' : statuses[item.status]?.name || 'Entrada'}</h2>${badge(closed ? 3 : item.status)}</div>${item.incomplete ? '<p class="integration-note">Cadastro incompleto · complete as informações quando necessário.</p>' : ''}${closed ? `<p class="subtext">Entregue em ${new Date(item.closedAt).toLocaleString('pt-BR')} por ${esc(item.closedByName || 'usuário da oficina')}.</p>` : ''}<form id="quick-order-edit-form" data-id="${item.id}" class="form-grid"><label class="field">Cliente<input name="clientName" maxlength="120" value="${esc(item.clientName)}" ${disabled}></label><label class="field">Telefone<input name="phone" type="tel" inputmode="tel" maxlength="30" value="${esc(item.phone)}" ${disabled}></label><label class="field">Marca<input name="vehicleBrand" maxlength="60" value="${esc(item.vehicleBrand)}" ${disabled}></label><label class="field">Modelo<input name="vehicleModel" maxlength="120" value="${esc(item.vehicleModel)}" ${disabled}></label><label class="field">Placa<input name="plate" maxlength="10" style="text-transform:uppercase" value="${esc(item.plate)}" ${disabled}></label><label class="field full">Problema relatado<textarea name="issue" maxlength="2000" ${disabled}>${esc(item.issue)}</textarea></label>${!closed && manager ? `<label class="field">Status<select name="status">${statuses.map((status,index) => `<option value="${index}" ${item.status === index ? 'selected' : ''}>${status.name}</option>`).join('')}</select></label><label class="field">Mecânico responsável<select name="assignedUserId"><option value="">Sem atribuição</option>${ui.teamMembers.filter(user => user.role === 'MECHANIC' && user.status === 'ACTIVE').map(user => `<option value="${esc(user.id)}" ${item.assignedUserId === user.id ? 'selected' : ''}>${esc(user.name)}</option>`).join('')}</select></label>` : `<p class="field full">Mecânico responsável: ${esc(assigned)}</p>`}${!closed ? `<div class="field full"><button class="btn primary large full" type="submit">Salvar alterações</button></div>` : ''}</form>${canDeliver ? `<div class="divider"></div>${btn('Entregar veículo','deliver-order','check','primary large',`data-id="${item.id}"`)}` : ''}${closed && ui.session?.role === 'OWNER' ? `<div class="divider"></div>${btn('Reabrir OS','reopen-order','history','ghost',`data-id="${item.id}"`)}` : ''}<div class="divider"></div><h3>Histórico</h3>${(item.history || []).map(entry => `<p class="subtext">${esc(entry.text || entry.action)} · ${new Date(entry.at).toLocaleString('pt-BR')}</p>`).join('')}</section>`;
  }

  async function saveQuickOrderEdit(form) {
    const requestedUserId = ui.session?.id, generation = ui.workshopGeneration;
    if (!inventoryManager() || remoteOrder(form.dataset.id)?.closedAt || remoteOrder(form.dataset.id)?.status === 3 || form.dataset.sending === 'true') return;
    const values = Object.fromEntries(new FormData(form));
    if (values.status !== undefined) values.status = Number(values.status);
    if (values.assignedUserId === '') values.assignedUserId = null;
    const submit = form.querySelector('button[type="submit"]');
    form.dataset.sending = 'true'; if (submit) submit.disabled = true;
    try {
      const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(form.dataset.id)}`,{ method:'PATCH',body:values });
      if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a ordem.');
       ui.serverOrders = ui.serverOrders.map(item => item.id === data.order.id ? data.order : item);
       if (values.status === 2 || data.materials || data.reservations) refreshInventoryAfterOrderChange();
       const currentForm = document.getElementById('quick-order-edit-form');
      if (currentForm?.dataset.id === form.dataset.id) currentForm.querySelectorAll('[data-dirty]').forEach(field => field.removeAttribute('data-dirty'));
      render(); toast(`OS #${data.order.id} atualizada.`);
    } catch (error) { if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) toast(error.message || 'Não foi possível atualizar a ordem.',true); }
    finally { form.dataset.sending = 'false'; if (submit) submit.disabled = false; }
  }

  async function resendInvitation(userId) {
    try {
      const { response,data } = await apiRequest(`/api/team/${encodeURIComponent(userId)}/resend-invitation`,{ method:'POST' });
      if (!response.ok) throw new Error(data.error || 'Não foi possível reenviar o convite.');
      toast(data.message || 'Convite reenviado.');
    } catch (error) { toast(error.message || 'Não foi possível reenviar o convite.',true); }
  }

  async function updateTeamMember(userId,active) {
    try {
      const { response,data } = await apiRequest(`/api/team/${encodeURIComponent(userId)}`,{ method:'PATCH',body:{ active } });
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o funcionário.');
      ui.teamMembers = ui.teamMembers.map(user => user.id === userId ? data.user : user);
      render(); toast(active ? 'Acesso reativado.' : 'Funcionário desativado.');
    } catch (error) { toast(error.message || 'Não foi possível atualizar o funcionário.',true); }
  }

  async function loadActivationInvite() {
    if (ui.activationLoaded) return;
    ui.activationLoaded = true;
    const token = activationTokenFromHash();
    if (!token) { ui.activationError = 'O link de ativação está incompleto.'; render(); return; }
    try {
      const { response,data } = await apiRequest(`/api/auth/activate?token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(data.error || 'Convite inválido ou expirado.');
      ui.activationName = data.name || '';
    } catch (error) { ui.activationError = error.message || 'Convite inválido ou expirado.'; }
    render();
  }
  function revenueChart() {
    const values = ui.report === 7 ? [2200,3400,2900,4100,3200,4900,3800] : [1200,2600,1800,3100,2000,3800,2900,3400,2000,2800,3600,4100,2300,3100,2800,3300,4000,3500,4200,2700,3700,4600,3300,3900,4300,3700,4600,4100,4900,3800];
    const points = values.map((v,i) => `${40+i*540/(values.length-1)},${210-v/5000*180}`).join(' ');
    return `<svg class="chart" viewBox="0 0 610 240" role="img" aria-label="Faturamento ilustrativo dos últimos ${ui.report} dias, entre R$ ${Math.min(...values)} e R$ ${Math.max(...values)}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${cssVar('--orange-hover','#38bdf8')}" stop-opacity=".18"/><stop offset="1" stop-color="${cssVar('--orange-hover','#38bdf8')}" stop-opacity="0"/></linearGradient></defs>${[0,1,2,3,4].map(i => `<line class="chart-grid" x1="40" y1="${210-i*45}" x2="590" y2="${210-i*45}"/><text x="0" y="${214-i*45}">${i ? `${String(i*1.25).replace('.',',')}k` : '0'}</text>`).join('')}<polygon points="40,210 ${points} 580,210" fill="url(#chart-fill)"/><polyline points="${points}" stroke="${cssVar('--accent','#7dd3fc')}" stroke-width="2.5" fill="none" stroke-linejoin="round"/><circle cx="580" cy="${210-values.at(-1)/5000*180}" r="5" fill="${cssVar('--accent','#7dd3fc')}" stroke="${cssVar('--surface','#151b23')}" stroke-width="3"/></svg><div class="chart-labels">${(ui.report === 7 ? ['09 set','10 set','11 set','12 set','13 set','14 set','15 set'] : ['17 ago','22 ago','27 ago','01 set','06 set','11 set','15 set']).map(t => `<span>${t}</span>`).join('')}</div>`;
  }
  /* Obsolete illustrative report; the live report below uses persisted OS records.
  function reportsLegacyPage() {
    return `${heading('Visão de gestão','Os números que mostram o ritmo da sua oficina.',btn('Exportar relatório','export-report','download','ghost'))}<div class="report-metrics">${metric('FATURAMENTO DO MÊS','R$ 48.750','<span class="green">↗ 12,4%</span> vs. mês anterior','wallet','revenue')}${metric('TICKET MÉDIO','R$ 812','<span class="green">↗ 8,2%</span> vs. mês anterior','chart')}${metric('OS ABERTAS',state.orders.filter(o => o.status < 6).length,'Em acompanhamento no pátio','clipboard')}${metric('OS CONCLUÍDAS NO MÊS',60,'<span class="green">+8</span> vs. mês anterior','checkCircle')}${metric('TEMPO MÉDIO','2h 45m','<span class="green">↓ 18min</span> por serviço','clock')}${metric('APROVAÇÃO','87%','Orçamentos aprovados','check')}${metric('VEÍCULOS ATENDIDOS',54,'No mês de setembro','car')}${metric('PRODUTIVIDADE','82%','Horas produtivas / disponíveis','wrench')}</div><div class="reports-grid"><section class="panel"><div class="section-heading"><div><h2>Faturamento</h2><p class="section-caption">Evolução diária da oficina</p></div><div class="view-switch">${[7,30].map(n => `<button data-action="report-period" data-days="${n}" class="${ui.report === n ? 'active' : ''}">${n} dias</button>`).join('')}</div></div><div class="chart-legend"><span class="dot orange"></span>Receita por dia · Dados ilustrativos</div>${revenueChart()}</section><section class="panel"><div class="section-heading"><h2>OS por status</h2><span class="pill">Agora</span></div>${statuses.map((s,i) => { const n = state.orders.filter(o => o.status === i).length; return `<div class="status-row"><span class="label">${s.name}</span><div class="status-bar"><span style="width:${n/state.orders.length*100}%;background:${s.color}"></span></div><strong>${n}</strong></div>`; }).join('')}</section><section class="panel"><div class="section-heading"><h2>Serviços mais realizados</h2><span class="muted" style="font-size:11px">Setembro · Ilustrativo</span></div>${[['Troca de óleo e filtros',24,'R$ 9.360'],['Revisão preventiva',16,'R$ 18.400'],['Freios e suspensão',12,'R$ 15.360'],['Alinhamento e balanceamento',8,'R$ 1.760']].map(([s,n,v],i) => `<div class="service-rank"><span class="rank-number">0${i+1}</span><div><strong>${s}</strong><p class="subtext" style="font-size:11px">${n} serviços realizados</p></div><strong>${v}</strong></div>`).join('')}</section><section class="panel"><span class="activity-icon">${icon('up')}</span><h2 style="margin-top:20px">Uma oficina mais produtiva.</h2><p class="subtext" style="margin-top:15px">O tempo médio de execução caiu 18 minutos em relação ao mês anterior. Continue acompanhando os gargalos de aprovação e peças.</p><div class="divider"></div><a href="#/patio" class="btn ghost">${icon('board')}Acompanhar operação</a><p class="integration-note">Indicadores mensais e tendências são demonstrativos. A distribuição por status acompanha as alterações feitas nas OS.</p></section></div>`;
  }
  */
  function reportsPage() {
    const allOrders = [...state.orders,...ui.serverOrders].filter(order => order.status !== 3 && !order.closedAt);
    const openCount = allOrders.filter(order => order.status !== 2).length;
    if (!['OWNER','MANAGER'].includes(ui.session?.role)) return `${heading('Relatórios operacionais','Acompanhamento da operação da oficina.')}${metric('OS ABERTAS',openCount,'Servidor + registros locais','clipboard')}${metric('OS PRONTAS',allOrders.filter(order => order.status === 2).length,'Servidor + registros locais','checkCircle')}<section class="panel"><h2>OS por status</h2><p class="section-caption">Valores financeiros ficam disponíveis para proprietários e gerentes.</p>${statuses.map((status,index) => `<div class="status-row"><span class="label">${esc(status.name)}</span><strong>${allOrders.filter(order => order.status === index).length}</strong></div>`).join('')}</section>`;
    const report = ui.revenueReport, summary = report?.summary || {};
    const filters = `<section class="panel revenue-filters"><div class="form-grid"><label class="field">De<input id="revenue-from" type="date" value="${esc(ui.revenueFrom)}"></label><label class="field">Até<input id="revenue-to" type="date" value="${esc(ui.revenueTo)}"></label><label class="field">Mecânico<select id="revenue-mechanic"><option value="">Todos</option>${ui.teamMembers.filter(user => user.role === 'MECHANIC' && user.status !== 'INACTIVE').map(user => `<option value="${esc(user.id)}" ${String(ui.revenueMechanic) === String(user.id) ? 'selected' : ''}>${esc(user.name)}</option>`).join('')}</select></label><div class="revenue-filter-actions"><button class="btn primary" data-action="revenue-refresh">Atualizar</button><button class="btn ghost" data-action="export-report">${icon('download')}Exportar CSV</button></div></div></section>`;
    if (ui.revenueLoading && !report) return `${heading('Faturamento','Dados reais das OS do servidor.')}${filters}<section class="panel report-loading">Carregando faturamento...</section>`;
    if (ui.revenueError) return `${heading('Faturamento','Dados reais das OS do servidor.')}${filters}<section class="panel report-error"><p class="auth-form-error">${esc(ui.revenueError)}</p><button class="btn primary" data-action="revenue-retry">Tentar novamente</button></section>`;
    const statusLabels = { ENTRY:'Entrada', WAITING_PARTS:'Aguardando peças', READY:'Pronto', DELIVERED:'Entregue' };
    const statusRows = Object.entries(report?.byStatus || {}).map(([key,count]) => `<div class="status-row"><span class="label">${esc(statusLabels[key] || key)}</span><strong>${count}</strong></div>`).join('');
    const periodRows = (report?.byPeriod || []).map(day => `<tr><td>${esc(day.date)}</td><td>${day.orders}</td><td>${money(day.netRevenue)}</td></tr>`).join('');
    return `${heading('Faturamento','Indicadores financeiros das OS do servidor.',btn('Exportar CSV','export-report','download','ghost'))}${filters}<div class="report-metrics">${metric('FATURAMENTO',money(summary.netRevenue || 0),'Receita líquida no período','wallet','revenue')}${metric('OS ENTREGUES',summary.deliveredOrders || 0,'OS do servidor','checkCircle')}${metric('TICKET MÉDIO',money(summary.averageTicket || 0),'Receita líquida / OS entregue','chart')}${metric('OS ABERTAS',openCount,'Servidor + registros locais','clipboard')}${metric('VEÍCULOS',new Set([...ui.serverOrders,...ui.closedOrders].map(order => order.vehicleId || order.plate).filter(Boolean)).size,'OS do servidor','car')}</div><div class="reports-grid"><section class="panel"><div class="section-heading"><h2>OS por status</h2><span class="pill">Período selecionado</span></div>${statusRows}</section><section class="panel"><div class="section-heading"><h2>Faturamento por dia</h2><span class="muted">OS do servidor</span></div>${periodRows ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>OS</th><th>Receita líquida</th></tr></thead><tbody>${periodRows}</tbody></table></div>` : '<p class="subtext">Nenhuma OS entregue no período.</p>'}</section></div>`;
  }
  function settingsPage() {
    if (ui.session?.role === 'OWNER' && ui.settings === 'Serviços') { loadServiceTemplates(); const rows=ui.serviceTemplates.map(item => `<div class="between service-template-row"><div><strong>${esc(item.name)}</strong><p class="subtext">${money(item.defaultPrice)} · ${item.active ? 'Ativo' : 'Inativo'}</p></div>${btn('Editar','service-template-edit','settings','ghost',`data-id="${esc(item.id)}"`)}</div>`).join(''); return `${heading('Catálogo de serviços','Preços padrão da sua oficina para preencher novas OS.',btn('Novo serviço','service-template-new','plus','primary'))}<section class="panel">${ui.serviceTemplatesLoading ? '<p>Carregando serviços...</p>' : ui.serviceTemplatesError ? `<p class="auth-form-error">${esc(ui.serviceTemplatesError)}</p>` : rows || empty('Nenhum serviço cadastrado','Adicione o primeiro serviço ao catálogo.')}</section>`; }
    let content;
    if (ui.settings === 'Oficina') content = `<h2>Dados da oficina</h2><p class="subtext">A identidade da sua operação dentro do GIRO.</p><div class="divider"></div><form id="settings-form"><div class="form-grid"><label class="field full">Nome da oficina<input name="workshop" required maxlength="70" value="${esc(state.settings.workshop)}"></label><label class="field">Responsável<input name="name" required maxlength="60" value="${esc(state.settings.name)}"></label><label class="field">E-mail<input name="email" type="email" required value="${esc(state.settings.email)}"></label><label class="field">Telefone<input name="phone" type="tel" required value="${esc(state.settings.phone)}"></label><label class="field full">Endereço<input name="address" required value="${esc(state.settings.address)}"></label></div><div class="divider"></div><button type="submit" class="btn primary">${icon('check')}Salvar alterações</button></form>`;
    else if (ui.settings === 'Notificações') content = `<h2>Notificações da operação</h2><p class="subtext">Receba apenas o que precisa da sua atenção.</p><label class="switch-label"><div><strong>Central de notificações</strong><p>Aprovações, peças pendentes, entregas e novos atendimentos.</p></div><input type="checkbox" id="notification-setting" ${state.settings.notifications ? 'checked' : ''}></label><p class="integration-note">Preferência local. Notificações push e envio por e-mail dependem de integração com o backend.</p>`;
    else if (ui.settings === 'Integrações') content = `<h2>Integrações</h2><div class="divider"></div><div class="between"><div class="row">${icon('chat')}<h3>WhatsApp Business</h3></div><span class="badge" style="--status:#9ca3af">Não conectado</span></div><p class="integration-note" style="margin:20px 0">O GIRO ainda não está conectado ao WhatsApp Business. Nenhuma mensagem será enviada por esta conta.</p>`;
    else content = `<h2>Ambiente de demonstração</h2><p class="subtext">Suas alterações são armazenadas somente neste navegador, sem sincronização com outros dispositivos.</p><div class="divider"></div><div class="key-value"><span>Versão</span><strong>GIRO Frontend · 1.0</strong></div><div class="key-value"><span>Ordens cadastradas</span><strong>${state.orders.length}</strong></div><div class="key-value"><span>Armazenamento</span><strong>LocalStorage</strong></div><div class="divider"></div>${btn('Restaurar dados de demonstração','reset-demo','history','danger')}<p class="integration-note">Esta ação apaga as alterações locais e restaura os exemplos originais.</p>`;
    return `${heading('Configurações','Ajuste o GIRO ao jeito da sua oficina.')}<div class="settings-layout"><nav class="settings-tabs" aria-label="Seções de configurações">${['Oficina','Notificações','Integrações','Serviços','Demonstração'].map(t => `<button class="tab ${ui.settings === t ? 'active' : ''}" data-action="settings-tab" data-tab="${t}">${t}</button>`).join('')}</nav><section class="panel">${content}</section></div>`;
  }
  function serviceTemplateModal(id) { const item=ui.serviceTemplates.find(item=>item.id===id) || {name:'',defaultPrice:0,active:true}; openModal(id?'Editar serviço':'Novo serviço',`<form id="service-template-form" data-id="${esc(id || '')}" class="form-grid"><label class="field full">Nome<input name="name" maxlength="160" required value="${esc(item.name)}"></label><label class="field">Preço padrão<input name="defaultPrice" type="number" min="0" max="1000000" step="0.01" required value="${item.defaultPrice}"></label><label class="checkbox-row"><input name="active" type="checkbox" ${item.active?'checked':''}> Ativo</label><p class="auth-form-error" data-template-error></p></form>`,`<button class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit" form="service-template-form">Salvar</button>`); }
  function historyOrders() {
    const remote = ui.closedOrders.map(order => ({ ...order, historyRemote:true, vehicle:[order.vehicleBrand,order.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado', plate:order.plate || 'Placa não informada', client:order.clientName || 'Cliente não informado', mechanic:order.assignedUserName || 'Não atribuído', service:order.service || order.issue || 'Serviço não informado', completedAt:order.closedAt || order.finishedAt || order.entryAt, value:order.estimatedValue }));
    const local = state.orders.filter(order => order.status === 3 || order.closedAt).map(order => { const v=vehicle(order.vehicle), c=client(v.client), m=member(order.mechanic); return { ...order, historyRemote:false, vehicle:[v.brand,v.model].filter(Boolean).join(' ') || 'Veículo não informado', plate:v.plate || 'Placa não informada', client:c.name || 'Cliente não informado', mechanic:m.name || 'Não atribuído', service:order.service || order.issue || 'Serviço não informado', completedAt:order.closedAt || order.createdAt, value:order.value }; });
    return [...remote,...local].sort((a,b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  }
  function historyFilteredOrders() {
    const query = ui.historyQuery.trim().toLocaleLowerCase('pt-BR');
    return historyOrders().filter(order => {
      const haystack = `${order.id} ${order.vehicle} ${order.plate} ${order.client} ${order.mechanic} ${order.service}`.toLocaleLowerCase('pt-BR');
      const completed = order.completedAt ? new Date(order.completedAt) : null;
      const day = completed && !Number.isNaN(completed.getTime()) ? completed.toISOString().slice(0,10) : '';
      return (!query || haystack.includes(query)) && (!ui.historyFrom || day >= ui.historyFrom) && (!ui.historyTo || day <= ui.historyTo) && (!ui.historyMechanic || order.mechanic === ui.historyMechanic);
    });
  }
  function historyDetails(order) {
    if (!order) return '';
    const history = (order.history || []).map(item => `<li>${esc(item.text || item.action || 'Atualização')} <small>${esc(item.at || item.date || '')}</small></li>`).join('');
    return `<aside class="history-detail panel"><div class="between"><div><span class="eyebrow">Detalhes da OS</span><h2>OS #${esc(order.id)}</h2></div><button class="icon-btn" data-action="history-detail-close" aria-label="Fechar detalhes">${icon('close')}</button></div><div class="history-detail-grid"><div><span>Veículo</span><strong>${esc(order.vehicle)}</strong></div><div><span>Placa</span><strong>${esc(order.plate)}</strong></div><div><span>Cliente</span><strong>${esc(order.client)}</strong></div><div><span>Mecânico</span><strong>${esc(order.mechanic)}</strong></div><div><span>Serviço realizado</span><strong>${esc(order.service)}</strong></div><div><span>Status final</span><strong>Entregue / Encerrada</strong></div><div><span>Entrada</span><strong>${esc(order.entryAt || order.entry || 'Não informado')}</strong></div><div><span>Conclusão</span><strong>${esc(order.completedAt || 'Não informado')}</strong></div>${order.value != null ? `<div><span>Valor</span><strong>${esc(money(Number(order.value)))}</strong></div>` : ''}</div>${history ? `<div class="divider"></div><h3>Eventos da OS</h3><ul class="history-timeline">${history}</ul>` : ''}</aside>`;
  }
  function historyModalBody() {
    const orders = historyFilteredOrders(), mechanics = [...new Set(historyOrders().map(order => order.mechanic).filter(name => name && name !== 'Não atribuído'))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    const cards = orders.length ? orders.map(order => `<article class="history-order-card"><div class="history-order-main"><div class="between wrap"><span class="eyebrow">OS #${esc(order.id)}</span><span class="badge" style="--status:#94a3b8">Encerrada</span></div><h3>${esc(order.vehicle)}</h3><p class="history-order-meta">${esc(order.plate)} · ${esc(order.client)}</p><div class="history-order-grid"><span><small>Mecânico</small><strong>${esc(order.mechanic)}</strong></span><span><small>Serviço</small><strong>${esc(order.service)}</strong></span><span><small>Entrada</small><strong>${esc(order.entryAt || order.entry || 'Não informado')}</strong></span><span><small>Conclusão</small><strong>${esc(order.completedAt || 'Não informado')}</strong></span>${order.value != null ? `<span><small>Valor</small><strong>${esc(money(Number(order.value)))}</strong></span>` : ''}</div></div><button class="btn ghost history-detail-button" data-action="history-detail" data-id="${esc(order.id)}" data-remote="${order.historyRemote}">${icon('search')}Ver detalhes</button></article>`).join('') : empty('Nenhuma OS finalizada encontrada','Ajuste a pesquisa ou os filtros de período e mecânico.');
    const detail = ui.historyDetail ? historyDetails(historyOrders().find(order => String(order.id) === String(ui.historyDetail.id) && Boolean(order.historyRemote) === Boolean(ui.historyDetail.remote))) : '';
    return `<div class="history-modal-toolbar"><label class="field grow">Pesquisar OS, veículo, cliente ou serviço<input id="history-search" type="search" value="${esc(ui.historyQuery)}" placeholder="Ex.: placa, cliente ou mecânico"></label><label class="field">Mecânico<select id="history-mechanic"><option value="">Todos</option>${mechanics.map(name => `<option value="${esc(name)}" ${ui.historyMechanic === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><label class="field">De<input id="history-from" type="date" value="${esc(ui.historyFrom)}"></label><label class="field">Até<input id="history-to" type="date" value="${esc(ui.historyTo)}"></label></div><div class="history-modal-summary"><strong>${orders.length}</strong><span>ordens finalizadas encontradas</span></div><div class="history-modal-content ${detail ? 'has-detail' : ''}"><div class="history-orders-list">${cards}</div>${detail}</div>`;
  }
  function openHistoryModal() {
    if (modal.querySelector('[data-sending="true"],[data-outcome-unknown="true"]')) return;
    restoreFocus = document.activeElement; modal.className = 'history-modal'; modal.innerHTML = `<div class="history-modal-header"><div><span class="eyebrow orange">HISTÓRICO DA OFICINA</span><h2 id="modal-title">Ordens finalizadas</h2><p>Consulte os serviços concluídos sem sair da tela atual.</p></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar Histórico">${icon('close')}</button></div><div class="history-modal-body">${historyModalBody()}</div>`; removeStaleOrderLinks(modal); if (!modal.open) modal.show(); setTimeout(() => document.getElementById('history-search')?.focus(),80);
  }
  function refreshHistoryModal() { const body = modal.querySelector('.history-modal-body'); if (body) body.innerHTML = historyModalBody(); }
  function historyPage() { return `${heading('Histórico','O histórico agora abre pelo botão Histórico, sem trocar de tela.')}<section class="panel"><p class="subtext">Use o botão Histórico no topo desta tela para consultar as ordens finalizadas.</p>${btn('Abrir Histórico','history-modal','history','primary')}</section>`; }
  /* Historical help copy no longer matches the simplified workflow.
  function helpPage() {
    return `${heading('Como podemos ajudar?','Respostas rápidas para manter a oficina em movimento.')}<div class="help-grid">${[['Como movimentar um veículo no pátio?','No computador, arraste o card até a coluna desejada. Em celulares, tablets ou usando teclado, abra a OS e toque em “Alterar status”. A alteração aparece também na tabela de ordens.'],['Como funciona o modo mecânico?','Abra Serviços, escolha o mecânico e toque em Iniciar serviço. Use Pausar, Retomar e Finalizar durante o trabalho. A finalização do mecânico envia o carro à inspeção final; a liberação para entrega acontece em Finalizar OS.'],['Como criar uma OS a partir do WhatsApp?','Selecione a conversa e use “Criar Ordem de Serviço” no painel de dados do cliente. No celular, abra o ícone de prancheta no topo da conversa. O veículo e o problema já vêm preenchidos.'],['Onde ficam os dados desta demonstração?','As alterações ficam no armazenamento local deste navegador. Não há autenticação de produção, comunicação real com o WhatsApp ou sincronização com servidor. Você pode restaurar os exemplos em Configurações → Demonstração.'],['Como adicionar fotos?','Na ordem ou no modo mecânico, toque em Foto. Selecione uma imagem JPG, PNG ou WebP com até 2 MB. O GIRO reduz o tamanho da imagem para armazená-la localmente.'],['Como acessar a apresentação?','Use Visão Geral para acompanhar o pátio, Relatórios para a gestão e Serviços para a experiência do mecânico. A tela de entrada está disponível pelo botão Sair no rodapé do menu.']].map(([q,a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;
  }
  */
  function operationalHelpPage() {
    return `${heading('Como funciona o GIRO','O fluxo atual da oficina em três estados.')}<div class="help-grid">${[['Entrada','OS novas começam em Entrada. O dono ou gerente pode atribuir um mecânico pela página da ordem.'],['Aguardando peças','O mecânico marca esta etapa quando precisa esperar uma peça.'],['Pronto','O mecânico finaliza diretamente, com ou sem passagem por Aguardando peças. A OS e o histórico permanecem disponíveis.'],['Meus Serviços','A área é exclusiva do mecânico e lista as OS atribuídas à sessão autenticada.'],['WhatsApp','A navegação do WhatsApp está temporariamente desativada; a integração foi preservada.']].map(([title,text]) => `<details><summary>${title}</summary><p>${text}</p></details>`).join('')}</div>`;
  }
  function notFound() { return `${heading('Não encontramos esta página.','O registro pode não existir neste ambiente de demonstração.')}<a class="btn primary" href="#/dashboard">Voltar à visão geral ${icon('arrow')}</a>`; }
  function authPage(page) {
    const signup = page === 'cadastro', recovery = page === 'recuperar', recoverySent = page === 'recuperacao-enviada', reset = page === 'redefinir-senha', activate = page === 'ativar-conta';
    let form;
    if (signup) {
      const d = ui.signupData, errors = ui.signupErrors;
      const focusOptions = ['Organizar ordens de serviço','Acompanhar a equipe','Melhorar o atendimento'];
      const sections = [ `<label class="field">Nome completo<input name="name" autocomplete="name" maxlength="80" value="${esc(d.name || '')}" placeholder="Seu nome">${fieldErrorMarkup('name',errors.name)}</label><label class="field">WhatsApp<input id="signup-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="15" aria-describedby="signup-phone-error" value="${esc(formatBrazilianPhone(d.phone || ''))}" placeholder="(51) 99999-9999"><span class="field-error" id="signup-phone-error" data-field-error="phone" aria-live="polite">${esc(errors.phone || '')}</span></label>`, `<label class="field">Nome da oficina<input name="workshop" maxlength="70" value="${esc(d.workshop || '')}" placeholder="Como sua oficina se chama?">${fieldErrorMarkup('workshop',errors.workshop)}</label>${signupLocationFields(d)}`, `<label class="field">E-mail<input name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" value="${esc(d.email || '')}" placeholder="voce@oficina.com.br">${fieldErrorMarkup('email',errors.email)}</label><label class="field">Crie uma senha<input name="password" type="password" autocomplete="new-password" maxlength="128" value="${esc(d.password || '')}" placeholder="No mínimo 8 caracteres">${fieldErrorMarkup('password',errors.password)}</label><label class="field">Confirmar senha<input name="passwordConfirmation" type="password" autocomplete="new-password" maxlength="128" value="${esc(d.passwordConfirmation || '')}" placeholder="Digite a senha novamente">${fieldErrorMarkup('passwordConfirmation',errors.passwordConfirmation)}</label><p class="integration-note">Use de 8 a 128 caracteres. A senha é protegida pelo backend e nunca é salva no navegador.</p>`, `<div class="auth-notice"><strong>Tudo pronto para dar o próximo GIRO.</strong><p style="margin-top:12px">${esc(d.workshop)}<br>${esc(d.name)} · ${esc(d.email)}<br>${esc(d.city || '')}${d.state ? ` - ${esc(d.state)}` : ''}</p></div><label class="field">Seu foco inicial<select name="focus">${focusOptions.map(option => `<option ${d.focus === option ? 'selected' : ''}>${option}</option>`).join('')}</select>${fieldErrorMarkup('focus',errors.focus)}</label><label class="checkbox-row"><input name="terms" type="checkbox" ${d.terms ? 'checked' : ''}>Confirmo os dados e aceito criar esta conta.</label>${fieldErrorMarkup('terms',errors.terms)}` ];
      const submitLabel = ui.signup === 1 ? 'Confirmar' : ui.signup === 4 ? 'Criar minha conta' : 'Continuar';
      form = `<h2>Sua oficina no GIRO.</h2><p class="subtext">Poucos passos para começar a organizar.</p><div class="signup-progress">${['Responsável','Oficina','Conta','Concluir'].map((t,i) => `<span class="signup-step ${i+1 <= ui.signup ? 'active' : ''}"><b>${i+1 < ui.signup ? '✓' : i+1}</b>${t}</span>`).join('')}</div><form id="signup-form" novalidate>${sections[ui.signup-1]}<p class="auth-form-error" data-form-error aria-live="polite">${esc(errors.form || '')}</p><button class="btn primary auth-submit" data-auth-submit type="submit" disabled>${submitLabel}${icon('arrow')}</button></form>${ui.signup > 1 ? btn('Voltar','signup-back','left','ghost', 'style="width:100%;margin-top:10px"') : ''}<p class="auth-foot">Já conhece o GIRO? <a href="#/login" class="orange">Entrar</a></p>`;
    } else if (activate) {
      form = ui.activationDone
        ? `<span class="eyebrow orange">Tudo pronto</span><h2>Conta ativada com sucesso.</h2><p class="subtext">Agora você já pode entrar no GIRO com seu e-mail e a senha que criou.</p><a class="btn primary" href="#/login" style="width:100%">Entrar no GIRO ${icon('arrow')}</a>`
        : `<h2>Ative sua conta</h2><p class="subtext">${ui.activationName ? `Olá, ${esc(ui.activationName)}. ` : ''}Crie uma senha para acessar o GIRO.</p>${ui.activationError ? `<p class="auth-form-error">${esc(ui.activationError)}</p>` : `<form id="activate-account-form" novalidate><label class="field">Nova senha<span class="password-field"><input type="password" name="password" autocomplete="new-password" maxlength="128" placeholder="No mínimo 8 caracteres" required><button type="button" class="icon-btn" data-action="toggle-password" aria-label="Mostrar senha">${icon('eye')}</button></span>${fieldErrorMarkup('password')}</label><label class="field">Confirmar senha<span class="password-field"><input type="password" name="confirmPassword" autocomplete="new-password" maxlength="128" placeholder="Digite a senha novamente" required><button type="button" class="icon-btn" data-action="toggle-password" aria-label="Mostrar senha">${icon('eye')}</button></span>${fieldErrorMarkup('confirmPassword')}</label><p class="auth-form-error" data-form-error aria-live="polite"></p><button class="btn primary auth-submit" data-auth-submit type="submit" ${ui.activationName ? '' : 'disabled'}>Ativar minha conta ${icon('arrow')}</button></form>`}<a class="btn ghost" href="#/login" style="width:100%;margin-top:10px">Voltar para entrar</a>`;
    } else if (recovery) form = `<h2>Recuperar acesso</h2><p class="subtext">Informe seu e-mail e enviaremos as instruções de redefinição, se houver uma conta vinculada.</p><form id="recovery-form" novalidate><label class="field">E-mail<input type="email" name="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="voce@oficina.com.br">${fieldErrorMarkup('email')}</label><p class="auth-form-error" data-form-error aria-live="polite"></p><button class="btn primary auth-submit" data-auth-submit type="submit">Continuar ${icon('arrow')}</button></form><a class="btn ghost" href="#/login" style="width:100%">Voltar para entrar</a>`;
    else if (recoverySent) form = `<span class="eyebrow orange">Verifique seu e-mail</span><h2 style="margin-top:15px">Instruções enviadas.</h2><div class="auth-notice"><strong>Se existir uma conta vinculada a este e-mail, enviaremos as instruções para redefinir sua senha.</strong><p style="margin-top:12px">Confira sua caixa de entrada e também a pasta de spam. O link é temporário e pode ser usado apenas uma vez.</p></div><a class="btn primary" href="#/login" style="width:100%">Voltar para entrar</a><a class="btn ghost" href="#/recuperar" style="width:100%;margin-top:10px">Enviar novamente</a>`;
    else if (reset) form = `<h2>Redefinir senha</h2><p class="subtext">Crie uma nova senha para voltar a acessar o GIRO.</p><form id="reset-password-form" novalidate><input type="hidden" name="token" value="${esc(resetTokenFromHash())}"><label class="field">Nova senha<span class="password-field"><input type="password" name="password" autocomplete="new-password" maxlength="128" placeholder="No mínimo 8 caracteres"><button type="button" class="icon-btn" data-action="toggle-password" aria-label="Mostrar senha">${icon('eye')}</button></span>${fieldErrorMarkup('password')}</label><label class="field">Confirmar nova senha<span class="password-field"><input type="password" name="confirmPassword" autocomplete="new-password" maxlength="128" placeholder="Digite a senha novamente"><button type="button" class="icon-btn" data-action="toggle-password" aria-label="Mostrar senha">${icon('eye')}</button></span>${fieldErrorMarkup('confirmPassword')}</label><p class="auth-form-error" data-form-error aria-live="polite">${resetTokenFromHash() ? '' : 'Link de redefinição inválido ou incompleto.'}</p><button class="btn primary auth-submit" data-auth-submit type="submit" ${resetTokenFromHash() ? '' : 'disabled'}>Redefinir senha ${icon('arrow')}</button></form><div class="auth-notice" data-reset-success hidden></div><a class="btn ghost" href="#/login" style="width:100%">Voltar para entrar</a>`;
    else form = `<span class="eyebrow orange">Bem-vindo de volta</span><h2 style="margin-top:15px">Entre no ritmo.</h2><p class="subtext">Sua oficina está esperando por você.</p><form id="login-form" novalidate><label class="field">E-mail<input type="email" name="email" inputmode="email" autocomplete="username" maxlength="254" placeholder="seuemail@exemplo.com">${fieldErrorMarkup('email',ui.loginErrors.email)}</label><label class="field">Senha<span class="password-field"><input type="password" name="password" id="password" autocomplete="current-password" maxlength="128" placeholder="Sua senha"><button type="button" class="icon-btn" data-action="toggle-password" aria-label="Mostrar senha">${icon('eye')}</button></span>${fieldErrorMarkup('password',ui.loginErrors.password)}</label><p class="auth-form-error" data-form-error aria-live="polite">${esc(ui.loginErrors.form || '')}</p><div class="between"><label class="checkbox-row"><input name="remember" type="checkbox">Lembrar meu e-mail</label><a href="#/recuperar" class="orange" style="font-size:12px">Esqueci minha senha</a></div><button class="btn primary large auth-submit" data-auth-submit type="submit">Entrar ${icon('arrow')}</button></form><p class="auth-foot">Não possui uma oficina cadastrada?<br><a href="#/cadastro" class="orange">Criar conta ${icon('arrow')}</a></p>`;
    return `<div class="auth">${themeBtn()}<section class="auth-story">${brand()}<div class="auth-copy"><span class="eyebrow">Gestão feita para quem entende de carros</span><h1>Sua oficina<br>em <span>movimento.</span></h1><p>Controle serviços, veículos e clientes sem papelada.</p><div class="auth-car">${carArt()}</div><div class="row" style="font-size:11px;color:#acb7c2">${icon('checkCircle')}Mais controle. Menos retrabalho.</div></div><div class="auth-story-footer"><span>© 2026 GIRO</span><span>Tecnologia que acompanha seu ritmo.</span></div></section><main id="main" class="auth-content"><div class="auth-form">${form}</div></main></div>`;
  }
  async function verifySession() {
    if (ui.authChecking) return;
    ui.authChecking = true;
    try {
      const response = await fetch('/api/auth/session'), data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sessão inválida.');
       ui.session = data.user;
       loadUserState(data.user);
       ui.authChecked = true; render();
    } catch (_) {
      ui.session = null; ui.authChecked = false; navigate('login');
    } finally { ui.authChecking = false; }
  }
  async function logout() {
    try { await fetch('/api/auth/logout',{ method:'POST' }); } catch (_) {}
    ui.patioExpanded = false; ui.patioMinimized = false; document.body.classList.remove('patio-expanded');
    resetWorkshopCache();
    ui.session = null; ui.authChecked = false; navigate('login');
  }
  function render() {
    const [page,id] = route();
    if (page === 'servicos' && modal.classList.contains('history-modal')) closeModal();
    const oldForm = document.getElementById('quick-order-edit-form');
    const draft = page === 'ordens' && oldForm?.dataset.id === String(id) && oldForm.dataset.userId === String(ui.session?.id) && Number(oldForm.dataset.generation) === ui.workshopGeneration ? {
      userId:ui.session?.id,generation:ui.workshopGeneration,id,
      fields:[...oldForm.querySelectorAll('[data-dirty="true"]')].filter(field => !field.disabled).map(field => ({ name:field.name,value:field.value,focused:field === document.activeElement,start:field.selectionStart,end:field.selectionEnd }))
    } : null;
    if (ui.patioExpanded && !['dashboard','patio'].includes(page)) ui.patioExpanded = false;
    document.body.classList.toggle('patio-expanded',Boolean(ui.patioExpanded));
    document.title = `GIRO | ${[...navItems,['login','','Entrar'],['cadastro','','Criar conta'],['recuperar','','Recuperar acesso'],['recuperacao-enviada','','Verifique seu e-mail'],['redefinir-senha','','Redefinir senha'],['ativar-conta','','Ativar conta']].find(n => n[0] === page)?.[2] || 'Sua oficina em movimento'}`;
      if (['login','cadastro','recuperar','recuperacao-enviada','redefinir-senha','ativar-conta'].includes(page)) { app.innerHTML = authPage(page); if (page === 'login') { try { const remembered = localStorage.getItem('giro-email'); if (remembered) { app.querySelector('[name="email"]').value = remembered; app.querySelector('[name="remember"]').checked = true; } } catch (_) {} const form = document.getElementById('login-form'); if (form) Object.entries(ui.loginErrors).forEach(([name,error]) => { if (name !== 'form') setFieldError(form,name,error); }); } else if (page === 'cadastro') initSignupFields(); else if (page === 'ativar-conta' && !ui.activationLoaded) loadActivationInvite(); return; }
     if (!ui.authChecked) { app.innerHTML = '<div class="boot"><img src="./mark.svg" width="48" height="48" alt="GIRO"><p>Verificando acesso...</p><div class="skeleton"></div></div>'; verifySession(); return; }
     if (page === 'veiculos') { navigate('clientes'); return; }
      if (ui.session && !storageKey) loadUserState(ui.session);
      navItems = menuForUser();
      if (!ui.serverOrdersLoaded && !ui.serverOrdersLoading) loadServerOrders();
      if (page === 'inicio') { navigate('dashboard'); return; }
      const assignedQuickDetail = ui.session?.role === 'MECHANIC' && page === 'ordens' && id && [...ui.serverOrders,...ui.closedOrders].some(item => String(item.id) === String(id) && item.assignedUserId === ui.session.id);
      if (!pageAllowed(page) && !assignedQuickDetail || (page === 'patio' && !['OWNER','MANAGER'].includes(ui.session?.role)) || (page === 'ajuda' && ui.session?.role === 'MECHANIC')) {
        app.innerHTML = shell(`${heading('Acesso não permitido','Você não possui permissão para acessar esta área.')}${btn('Voltar ao início','go-home','left','primary')}`, page); return;
      }
      if (page === 'clientes' && ['OWNER','MANAGER','ATTENDANT'].includes(ui.session?.role) && !ui.workshopVehiclesLoaded && !ui.workshopVehiclesLoading) loadWorkshopVehicles();
      if (materialUser() && (page === 'estoque' || page === 'ordens' && id && remoteOrder(id))) loadInventory();
      if (page === 'ordens' && id && remoteOrder(id) && materialUser()) loadOrderMaterials(id);
       if (['equipe','dashboard','patio','ordens','relatorios'].includes(page) && ['OWNER','MANAGER'].includes(ui.session?.role) && !ui.teamLoaded && !ui.teamLoading) loadTeam();
       if (['dashboard','relatorios'].includes(page) && ['OWNER','MANAGER'].includes(ui.session?.role) && !ui.revenueReport && !ui.revenueLoading && !ui.revenueError) loadRevenueReport();
      if (page === 'ordens' && id && ui.serverOrders.some(item => String(item.id) === String(id)) && ['OWNER','MANAGER'].includes(ui.session?.role) && !ui.teamLoaded && !ui.teamLoading) loadTeam();
       const pages = { dashboard, patio: () => `${heading('Pátio da Oficina','Entrada · Aguardando peças · Pronto.',btn('Nova OS','new-order','plus','primary'))}${boardSection()}`, ordens: () => id ? ([...ui.serverOrders,...ui.closedOrders].some(item => String(item.id) === String(id)) ? serviceOrderDetailPage(id) : order(id)?.status === 3 ? closedLocalOrderPage(id) : activeLocalOrderDetailPage(id)) : ordersPage(), servicos: () => workPage(id), clientes: () => clientsPage(id), whatsapp: whatsappPage, equipe: teamPage, relatorios: reportsPage, configuracoes: settingsPage, ajuda: operationalHelpPage };
      pages.estoque = inventoryPage;
      try {
        app.innerHTML = shell((pages[page] || notFound)(), page);
      } catch (error) {
        console.error('Falha ao renderizar página GIRO:', error);
        app.innerHTML = `<div class="auth"><main class="auth-content"><section class="auth-form"><h2>Não foi possível abrir o painel</h2><p class="subtext">Sua sessão foi autenticada, mas houve um erro ao carregar a página.</p><p class="auth-form-error">Detalhe: ${esc(error?.message || 'erro desconhecido')}</p><button class="btn primary" data-action="go-home">Tentar novamente</button><button class="btn ghost" data-action="logout">Sair</button></section></main></div>`;
      }
      app.querySelectorAll('.demo-tag, .live-status, .footer').forEach(element => element.remove());
      const roleNode = app.querySelector('.workshop-card .user-info small');
      if (roleNode) roleNode.textContent = roleLabel(ui.session?.role);
      if (page === 'estoque') app.querySelector('.inventory-history')?.setAttribute('hidden','');
      if (page === 'ordens' && id) app.querySelector('.legacy-material-actions')?.classList.remove('inventory-history');
      if (page === 'ordens' && id) {
        const orderForNotes = remoteOrder(id), panel = app.querySelector('.inventory-history');
        const reversed = orderForNotes?.materials?.filter(item => item.status === 'REVERSED' && item.reason) || [];
        if (panel && reversed.length && !panel.querySelector('[data-reversal-notes]')) panel.insertAdjacentHTML('beforeend',`<div data-reversal-notes class="inventory-reversal-notes">${reversed.map(item => `<p class="subtext">Estorno: ${esc(item.reason)}</p>`).join('')}</div>`);
      }
     app.querySelectorAll('.notification-dot').forEach(element => element.remove());
     if (page === 'ordens' && id && !remoteOrder(id) && order(id)) {
       const note = document.createElement('section'); note.className = 'panel inventory-history';
       note.innerHTML = '<h2>Materiais e estoque</h2><p class="subtext">Esta OS é um registro local legado e não está vinculada ao estoque do servidor. Seus dados foram preservados. Novas OS criadas pelo GIRO permitem confirmar materiais utilizados.</p>';
       app.querySelector('.page-enter')?.append(note);
     }
     app.querySelectorAll('.kanban-card[data-card-key]').forEach(card => { card.draggable = true; card.dataset.orderKey = card.dataset.cardKey; });
     if (page === 'ordens' && id && !['OWNER','MANAGER'].includes(ui.session?.role) && [...ui.serverOrders,...ui.closedOrders].some(item => String(item.id) === String(id))) {
       const editForm = app.querySelector('#quick-order-edit-form');
       editForm?.querySelectorAll('input,textarea,select').forEach(field => { field.disabled = true; });
       editForm?.querySelector('button[type="submit"]')?.remove();
     }
     if (page === 'ordens' && id && ['OWNER','MANAGER'].includes(ui.session?.role)) {
       const remoteOrder = [...ui.serverOrders,...ui.closedOrders].find(item => String(item.id) === String(id));
       if (remoteOrder && !remoteOrder.vehicleId && !remoteOrder.closedAt) {
         const panel = document.createElement('section'); panel.className = 'panel'; panel.innerHTML = `<h2>Cadastrar veículo na oficina</h2><p class="subtext">O cliente e o veículo serão compartilhados pelas contas desta oficina e vinculados a esta OS.</p><form id="register-vehicle-form" data-id="${remoteOrder.id}" class="form-grid"><label class="field">Ano<input name="year" type="number" min="1950" max="${new Date().getFullYear()+1}" required></label><label class="field">Quilometragem<input name="mileage" type="number" min="0" value="0" required></label><button class="btn primary" type="submit">Cadastrar cliente e veículo</button></form>`;
         app.querySelector('.page-enter')?.append(panel);
       }
     }
     const editForm = document.getElementById('quick-order-edit-form');
     if (editForm) {
       editForm.dataset.userId = String(ui.session?.id); editForm.dataset.generation = String(ui.workshopGeneration);
       if (draft && draft.userId === ui.session?.id && draft.generation === ui.workshopGeneration && editForm.dataset.id === String(draft.id) && inventoryManager()) {
         for (const saved of draft.fields) {
           const field = editForm.elements[saved.name];
           if (!field || field.disabled) continue;
           field.value = saved.value; field.dataset.dirty = 'true';
           if (saved.focused) { field.focus({ preventScroll:true }); if (saved.start != null) field.setSelectionRange(saved.start,saved.end); }
         }
       }
     }
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
    else if (page === 'ordens') { el.innerHTML = ordersTable(filteredOrders()); document.getElementById('result-count').textContent = `${filteredOrders().length} ordens encontradas`; const serverResults=document.getElementById('quick-orders-results'); if (serverResults) serverResults.outerHTML = quickOrdersSection(filteredServerOrders()); }
    else if (page === 'servicos') el.innerHTML = ui.serverOrders.filter(item => item.assignedUserId === ui.session?.id && item.status !== 2).map(mechanicServiceCard).join('') || empty('Você não possui serviços atribuídos no momento.','Quando uma ordem for atribuída a você, aparecerá aqui.');
    else if (page === 'clientes') { el.innerHTML = clientsTable(); const remote = document.getElementById('workshop-client-results'); if (remote) remote.innerHTML = workshopClientsSection().match(/id="workshop-client-results"[^>]*>([\s\S]*?)<\/div><\/section>/)?.[1] || ''; }
  }
  function log(o,text) { o.history.push({ text, date: new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) }); }
  function setStatus(o,status) { if (o.status === status) return; o.status = status; o.paused = status === 1; if (status === 2) o.late = false; log(o,`Status alterado para ${statuses[status].name}`); save(); render(); toast(`OS #${o.id} → ${statuses[status].name}`); }
  function statusModal(o) { openModal(`Alterar status · OS #${o.id}`,`<form id="status-form" data-id="${o.id}"><label class="field">Status<select name="status">${statuses.map((s,i) => `<option value="${i}" ${o.status === i ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary" form="status-form" type="submit">Salvar status</button>`); }
  function newOrderModal(dataset = {}) {
    openCreateOrderModal(dataset);
  }
  function legacyQuickOrderModal(dataset = {}) {
    const clientOptions = [...new Set(state.clients.map(item => item.name).filter(Boolean))].map(name => `<option value="${esc(name)}"></option>`).join('');
    const plateOptions = [...new Set(state.vehicles.map(item => item.plate).filter(Boolean))].map(value => `<option value="${esc(value)}"></option>`).join('');
    openModal(ui.session?.role === 'MECHANIC' ? 'Nova OS rápida' : 'Nova Ordem de Serviço',`<p class="subtext">Cadastre cliente e veículo aqui, sem sair da OS. Informe o que souber; os dados podem ser completados depois.</p><form id="quick-order-form" data-operation-id="${crypto.randomUUID()}" data-user-id="${esc(ui.session?.id)}" data-generation="${ui.workshopGeneration}" class="form-grid quick-order-form"><label class="field full">Cliente<input name="clientName" list="quick-client-options" maxlength="120" placeholder="Buscar ou informar nome" autocomplete="off"><datalist id="quick-client-options">${clientOptions}</datalist></label><label class="field full">Telefone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="(00) 00000-0000"></label><label class="field">Marca<input name="vehicleBrand" maxlength="60" placeholder="Ex.: Fiat"></label><label class="field">Modelo<input name="vehicleModel" maxlength="120" placeholder="Ex.: Argo"></label><label class="field full">Placa<input name="plate" list="quick-plate-options" maxlength="10" placeholder="ABC1D23" style="text-transform:uppercase" autocomplete="off"><datalist id="quick-plate-options">${plateOptions}${ui.workshopVehicles.map(item => `<option value="${esc(item.plate)}"></option>`).join('')}</datalist></label><label class="field">Ano (opcional)<input name="year" type="number" min="1950" max="${new Date().getFullYear()+1}" placeholder="Ex.: 2022"></label><label class="field">Quilometragem (opcional)<input name="mileage" type="number" min="0" max="2000000" placeholder="Ex.: 58400"></label><label class="field full">Problema relatado<textarea name="issue" maxlength="2000" placeholder="Descreva o que o cliente informou...">${esc(dataset.issue || '')}</textarea></label>${inventoryManager() ? `<label class="field full">Mecânico responsável (opcional)<select name="assignedUserId"><option value="">Sem atribuição</option>${ui.teamMembers.filter(user => user.role === 'MECHANIC' && user.status === 'ACTIVE').map(user => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('')}</select><small>${ui.teamLoading ? 'Equipe carregando. Você pode atribuir o responsável depois.' : 'Você pode atribuir o responsável depois.'}</small></label>` : ''}<p class="field full inventory-form-error" data-quick-error role="alert"></p></form>`,`${btn('Cancelar','close-modal','','ghost')}<button class="btn primary large" type="submit" form="quick-order-form">${icon('plus')}Criar OS</button>`);
    const form = document.getElementById('quick-order-form');
    const selectedVehicle = state.vehicles.find(item => String(item.id) === String(dataset.vehicle));
    if (selectedVehicle) {
      form.elements.vehicleBrand.value = selectedVehicle.brand || ''; form.elements.vehicleModel.value = selectedVehicle.model || ''; form.elements.plate.value = selectedVehicle.plate || '';
      const selectedClient = client(selectedVehicle.client); form.elements.clientName.value = selectedClient.name || ''; form.elements.phone.value = selectedClient.phone || '';
    }
    form?.addEventListener('change',event => {
      const clientInput = form.elements.clientName, phoneInput = form.elements.phone;
      const foundClient = state.clients.find(item => item.name.toLocaleLowerCase('pt-BR') === clientInput.value.trim().toLocaleLowerCase('pt-BR'));
      if (event.target === clientInput && foundClient && !phoneInput.value) phoneInput.value = foundClient.phone || '';
      if (event.target === form.elements.plate) {
        const foundVehicle = state.vehicles.find(item => item.plate.toUpperCase() === form.elements.plate.value.trim().toUpperCase());
        if (foundVehicle) {
          form.elements.vehicleBrand.value = foundVehicle.brand || ''; form.elements.vehicleModel.value = foundVehicle.model || '';
          const owner = client(foundVehicle.client);
          if (!clientInput.value) clientInput.value = owner.name;
          if (!phoneInput.value) phoneInput.value = owner.phone || '';
        }
      }
     });
   }
   function createClientOptions() {
     const clients = [...ui.workshopClients,...state.clients];
     return [...new Map(clients.filter(item => item.name).map(item => [normalizeSearch(item.name),item])).values()].map(item => `<option value="${esc(item.name)}">${esc(item.phone || '')}</option>`).join('');
   }
    const createItemOptions = () => ui.inventoryItems.filter(item => item.active && item.tracked).map(item => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.unit)} · disponível ${quantityLabel(item.available ?? Number(item.onHand ?? item.quantity) - Number(item.reserved || 0))}</option>`).join('');
    function createPartRow() {
      const meta = ui.inventoryLoading ? 'Carregando estoque...' : 'Selecione um item';
      return `<div class="create-line-item create-part-row" data-part-row><select name="partItemId" aria-label="Peça do estoque"><option value="">Selecione uma peça</option>${createItemOptions()}</select><input name="partQuantity" type="number" min="0.001" step="0.001" value="1" aria-label="Quantidade"><span class="create-line-meta" data-part-meta>${meta}</span><button type="button" class="icon-btn" data-action="remove-create-row" aria-label="Remover peça">${icon('close')}</button></div>`;
    }
    function createLaborRow() {
      const mechanics = ui.teamMembers.filter(user => user.role === 'MECHANIC' && user.status === 'ACTIVE');
      return `<div class="create-line-item labor-row" data-labor-row><input name="laborDescription" maxlength="2000" placeholder="Descrição da mão de obra"><input name="laborValue" type="number" min="0" step="0.01" value="0" placeholder="Valor (R$)"><select name="laborMechanic" aria-label="Mecânico"><option value="">Sem mecânico</option>${mechanics.map(user => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('')}</select><button type="button" class="icon-btn" data-action="remove-create-row" aria-label="Remover mão de obra">${icon('close')}</button></div>`;
    }
    function createMechanicLaborRow() {
      return `<div class="create-line-item labor-row mechanic-labor-row" data-labor-row><label class="field"><span>Serviço cadastrado</span><select name="serviceTemplateId" data-mechanic-service-select><option value="">Serviço personalizado</option>${ui.serviceTemplates.filter(item=>item.active).map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label class="field"><span>Descrição</span><input name="laborDescription" maxlength="2000" placeholder="Ex.: Serviço realizado"></label><label class="field"><span>Valor (R$)</span><input name="laborValue" type="number" min="0" step="0.01" value="0" placeholder="0,00"></label></div>`;
    }
    function serviceTemplateCheckboxes() {
      const active = ui.serviceTemplates.filter(item => item.active);
      return active.length ? `<div class="service-template-checkboxes">${active.map(item => `<label class="service-template-option"><input type="checkbox" name="serviceTemplateIds" value="${esc(item.id)}" data-service-template-checkbox><span class="service-template-copy"><strong>${esc(item.name)}</strong><small>Preço padrão: ${money(item.defaultPrice)}</small></span><span class="service-template-price"><span>Valor aplicado</span><input type="number" name="serviceTemplatePrice" value="${Number(item.defaultPrice).toFixed(2)}" min="0" step="0.01" data-service-template-price data-template-id="${esc(item.id)}" disabled></span></label>`).join('')}</div>` : '<p class="subtext">Nenhum serviço cadastrado. Você pode adicionar uma mão de obra personalizada abaixo.</p>';
    }
    function serviceTemplateOptions() {
      return `<option value="">Selecione um serviço cadastrado</option>${ui.serviceTemplates.filter(item=>item.active).map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${money(item.defaultPrice)}</option>`).join('')}`;
    }
   function createPendingRow() {
     return `<div class="create-line-item pending-row" data-pending-row><input name="pendingName" required maxlength="2000" placeholder="Nome do item"><input name="pendingQuantity" type="number" min="1" step="1" value="1" aria-label="Quantidade"><input name="pendingUnit" value="UN" maxlength="30" aria-label="Unidade"><input name="pendingNote" maxlength="2000" placeholder="Observação"><button type="button" class="icon-btn" data-action="remove-create-row" aria-label="Remover item pendente">${icon('close')}</button></div>`;
   }
    function updateCreateSummary(form) {
     if (!form) return;
     let parts = 0, labor = 0;
     form.querySelectorAll('[data-part-row]').forEach(row => { const item = ui.inventoryItems.find(item => String(item.id) === row.querySelector('[name="partItemId"]')?.value); const qty = Number(row.querySelector('[name="partQuantity"]')?.value || 0); const available = Number(item?.available ?? Number(item?.onHand ?? item?.quantity ?? 0) - Number(item?.reserved || 0)); const meta = row.querySelector('[data-part-meta]'); if (meta) meta.textContent = item ? `Disponível: ${quantityLabel(available)} ${item.unit}${inventoryManager() ? ` · ${money(item.costPrice)}` : ''}` : 'Selecione um item'; if (item && qty > available) row.classList.add('is-invalid'); else row.classList.remove('is-invalid'); parts += qty * Number(item?.costPrice || 0); });
      form.querySelectorAll('[data-labor-row]').forEach(row => { labor += Number(row.querySelector('[name="laborValue"]')?.value || 0); });
      form.querySelectorAll('[data-service-template-checkbox]:checked').forEach(checkbox => { const price=form.querySelector(`[data-service-template-price][data-template-id="${checkbox.value}"]`); labor += Number(price?.value || 0); });
     const discount = Number(form.elements.discount?.value || 0), total = Math.max(0,parts + labor - discount), summary = form.querySelector('[data-create-summary]');
     if (summary) summary.innerHTML = `<span>Peças / itens <strong>${money(parts)}</strong></span><span>Mão de obra <strong>${money(labor)}</strong></span><span>Desconto <strong>${money(discount)}</strong></span><span class="summary-total">Total estimado <strong>${money(total)}</strong></span>`;
      form.dataset.estimatedValue = String(total);
    }
    function updateCreateStockOptions() {
      const form = document.getElementById('quick-order-form');
      if (!form) return;
      form.querySelectorAll('[data-part-row] [name="partItemId"]').forEach(select => {
        const selected = select.value;
        select.innerHTML = `<option value="">Selecione uma peça</option>${createItemOptions()}`;
        select.value = [...select.options].some(option => option.value === selected) ? selected : '';
      });
    }
    function loadCreateReferences(mechanicMode = false) {
      if (!mechanicMode && !ui.teamLoaded && !ui.teamLoading) loadTeam();
      if (materialUser() && !ui.inventoryLoaded && !ui.inventoryLoading && !ui.inventoryError) loadInventory();
      loadServiceTemplates();
    }
    function openCreateOrderModal(dataset = {}) {
      const mechanicMode = ui.session?.role === 'MECHANIC';
      loadCreateReferences(mechanicMode);
      const mechanics = ui.teamMembers.filter(user => user.role === 'MECHANIC' && user.status === 'ACTIVE');
      const clientList = createClientOptions();
      if (mechanicMode) {
        openModal('Nova Ordem de Serviço',`<p class="subtext">Informe os dados essenciais do cliente, veículo e problema.</p><form id="quick-order-form" data-operation-id="${crypto.randomUUID()}" data-user-id="${esc(ui.session?.id)}" data-generation="${ui.workshopGeneration}" data-mechanic-mode="true" class="form-grid quick-order-form mechanic-order-create"><label class="field">Cliente<input name="clientName" list="create-client-options" maxlength="120" autocomplete="off"><datalist id="create-client-options">${clientList}</datalist></label><label class="field">Telefone<input name="phone" type="tel" inputmode="numeric" maxlength="15"></label><label class="field">Marca<input name="vehicleBrand" maxlength="60"></label><label class="field">Modelo<input name="vehicleModel" maxlength="120"></label><label class="field">Placa<input name="plate" maxlength="10" style="text-transform:uppercase"></label><label class="field full">Problema relatado<textarea name="issue" maxlength="2000">${esc(dataset.issue || '')}</textarea></label><details class="order-create-section mechanic-labor-section" open><summary>Serviço e valor</summary>${createMechanicLaborRow()}</details><details class="order-create-section mechanic-stock-section" open><summary>Peças / Itens</summary><div id="create-parts-list">${createPartRow()}</div><button type="button" class="btn ghost" data-action="add-create-part">+ Adicionar peça</button></details><p class="inventory-form-error" data-quick-error role="alert"></p></form>`,`<button class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn primary" form="quick-order-form" type="submit">Criar OS</button>`);
        const form = document.getElementById('quick-order-form');
        updateCreateSummary(form);
        return;
      }
       loadServiceTemplates();
       openModal('Nova Ordem de Serviço',`<p class="subtext">Registre o atendimento completo. Campos opcionais podem ser preenchidos depois.</p><form id="quick-order-form" data-operation-id="${crypto.randomUUID()}" data-user-id="${esc(ui.session?.id)}" data-generation="${ui.workshopGeneration}" class="form-grid quick-order-form">
       <details class="order-create-section" open><summary>Cliente e veículo</summary><div class="form-grid"><label class="field">Cliente<input name="clientName" list="create-client-options" maxlength="120" autocomplete="off"><datalist id="create-client-options">${clientList}</datalist></label><label class="field">Telefone<input name="phone" type="tel" inputmode="numeric" maxlength="15"></label><label class="field">Marca<input name="vehicleBrand" maxlength="60"></label><label class="field">Modelo<input name="vehicleModel" maxlength="120"></label><label class="field">Placa<input name="plate" maxlength="10" style="text-transform:uppercase"></label><label class="field">Ano<input name="year" type="number" min="1950" max="${new Date().getFullYear()+1}"></label><label class="field">Quilometragem<input name="mileage" type="number" min="0" max="2000000"></label></div></details>
        <details class="order-create-section" open><summary>Serviço</summary><div class="form-grid"><label class="field full">Problema relatado<textarea name="issue" maxlength="2000">${esc(dataset.issue || '')}</textarea></label><label class="field full">Serviço cadastrado<select name="serviceTemplateId" data-service-template-select>${serviceTemplateOptions()}</select><small>Escolha um serviço para preencher a descrição e o preço padrão.</small></label><label class="field full">Serviço personalizado / observações<textarea name="service" maxlength="2000" placeholder="Opcional"></textarea></label><label class="field">Mecânico responsável<select name="assignedUserId"><option value="">Sem atribuição</option>${mechanics.map(user => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('')}</select></label><label class="field">Prioridade<select name="priority"><option>Baixa</option><option selected>Normal</option><option>Alta</option></select></label><label class="field">Prazo (opcional)<input name="dueAt" type="datetime-local"></label></div></details>
       <details class="order-create-section" open><summary>Peças / Itens</summary><div id="create-parts-list">${createPartRow()}</div><button type="button" class="btn ghost" data-action="add-create-part">+ Adicionar peça do estoque</button><div id="create-pending-list"></div><button type="button" class="btn ghost" data-action="add-create-pending">+ Adicionar item não disponível</button></details>
       <details class="order-create-section" open><summary>Mão de obra</summary><div id="create-labor-list">${createLaborRow()}</div><button type="button" class="btn ghost" data-action="add-create-labor">+ Adicionar mão de obra</button></details>
        <details class="order-create-section" open><summary>Resumo</summary><label class="field">Desconto (R$)<input name="discount" type="number" min="0" step="0.01" value="0"></label><div class="order-create-summary" data-create-summary></div></details><p class="inventory-form-error" data-quick-error role="alert"></p></form>`,`<button class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn primary" form="quick-order-form" type="submit">Criar OS</button>`);
     const form = document.getElementById('quick-order-form');
        updateCreateSummary(form);
         form?.addEventListener('change', event => { if(event.target.matches('[data-service-template-select]')) { const item=ui.serviceTemplates.find(item=>item.id===event.target.value), row=form.querySelector('[data-labor-row]'); if(item && row) { row.dataset.templateId=item.id; row.querySelector('[name="laborDescription"]').value=item.name; row.querySelector('[name="laborValue"]').value=item.defaultPrice; form.elements.service.value=item.name; updateCreateSummary(form); } } });
   }
   function createOrderPayload(form) {
     const parts = [...form.querySelectorAll('[data-part-row]')].map(row => ({ row, itemId:row.querySelector('[name="partItemId"]')?.value, quantity:Number(row.querySelector('[name="partQuantity"]')?.value || 0) })).filter(part => part.itemId);
     const invalid = parts.find(part => { const item = ui.inventoryItems.find(item => String(item.id) === String(part.itemId)); return !Number.isFinite(part.quantity) || part.quantity <= 0 || part.quantity > Number(item?.available ?? Number(item?.onHand ?? item?.quantity ?? 0) - Number(item?.reserved || 0)); });
     if (invalid) throw new Error('A quantidade de uma peça excede o estoque disponível.');
      const laborItems = [...form.querySelectorAll('[data-labor-row]')].map(row => ({ templateId:row.dataset.templateId || undefined, description:row.querySelector('[name="laborDescription"]')?.value.trim(), value:Number(row.querySelector('[name="laborValue"]')?.value || 0), assignedUserId:row.querySelector('[name="laborMechanic"]')?.value || undefined })).filter(item => item.description);
      form.querySelectorAll('[data-service-template-checkbox]:checked').forEach(checkbox => { const item=ui.serviceTemplates.find(item=>item.id===checkbox.value), price=form.querySelector(`[data-service-template-price][data-template-id="${checkbox.value}"]`); if(item) laborItems.push({templateId:item.id,description:item.name,value:Number(price?.value || item.defaultPrice)}); });
     const pendingItems = [...form.querySelectorAll('[data-pending-row]')].map(row => ({ name:row.querySelector('[name="pendingName"]')?.value.trim(), quantity:Number(row.querySelector('[name="pendingQuantity"]')?.value || 0), unit:row.querySelector('[name="pendingUnit"]')?.value.trim() || 'UN', note:row.querySelector('[name="pendingNote"]')?.value.trim() || undefined })).filter(item => item.name);
     form.querySelectorAll('[data-part-row]').forEach((row,index) => { if (row.querySelector('[name="partItemId"]')?.value) row.dataset.reservationOperation = `${form.dataset.operationId}:reserve:${index}`; });
      const value = name => form.elements[name]?.value || '';
       const payload = { clientName:value('clientName').trim(),phone:value('phone').trim(),vehicleBrand:value('vehicleBrand').trim(),vehicleModel:value('vehicleModel').trim(),plate:value('plate').trim().toUpperCase(),year:value('year') || null,mileage:Number(value('mileage') || 0),issue:value('issue').trim(),service:value('service') || laborItems.map(item=>item.description).join(', '),priority:value('priority') || 'Normal',dueAt:value('dueAt') || null,discount:Number(value('discount') || 0),estimatedValue:Number(form.dataset.estimatedValue || 0),laborItems:laborItems || [],pendingItems:pendingItems || [],reservationParts:parts.map(part => ({ itemId:part.itemId,quantity:part.quantity,operationId:part.row.dataset.reservationOperation })),operationId:form.dataset.operationId};
      if (form.dataset.mechanicMode !== 'true') payload.assignedUserId = value('assignedUserId') || null;
      return payload;
   }
   async function reserveCreateParts(orderId,parts) {
     const reservations = [];
     for (const part of parts) {
       const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(orderId)}/reservations`,{ method:'POST',body:{ itemId:part.itemId,quantity:part.quantity,operationId:part.operationId } });
       if (!response.ok) throw new Error(data.error || `Não foi possível reservar ${part.itemId}.`);
       if (data.reservation) reservations.push(data.reservation);
       if (data.item) ui.inventoryItems = ui.inventoryItems.map(item => String(item.id) === String(data.item.id) ? data.item : item);
     }
     return reservations;
   }
  function noteModal(o,problem = false) { openModal(problem ? 'Registrar problema encontrado' : 'Adicionar observação',`<form id="note-form" data-id="${o.id}" data-problem="${problem}"><label class="field">${problem ? 'O que você encontrou?' : 'Observação para a equipe'}<textarea name="text" required maxlength="1500" placeholder="Descreva de forma objetiva..." autofocus></textarea></label></form>`,`${btn('Cancelar','close-modal','','ghost')}<button type="submit" form="note-form" class="btn primary">Salvar registro</button>`); }
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
    const recoveryForm = target.closest?.('#recovery-form');
    if (recoveryForm && target.name === 'email') {
      setFieldError(recoveryForm,'email',showError ? target.value.trim() ? isValidEmail(target.value) ? '' : 'E-mail inválido.' : 'Informe seu e-mail.' : '');
      const formError = recoveryForm.querySelector('[data-form-error]'); if (formError) formError.textContent = '';
    }
    const resetForm = target.closest?.('#reset-password-form');
    if (resetForm && ['password','confirmPassword'].includes(target.name)) {
      if (showError) validateResetPassword(resetForm,true);
      else setFieldError(resetForm,target.name,'');
      const formError = resetForm.querySelector('[data-form-error]'); if (formError) formError.textContent = '';
    }
    const loginForm = target.closest?.('#login-form');
    if (loginForm && ['email','password'].includes(target.name)) {
      delete ui.loginErrors[target.name]; delete ui.loginErrors.form;
      setFieldError(loginForm,target.name,showError ? target.name === 'email' ? target.value.trim() ? isValidEmail(target.value) ? '' : 'E-mail inválido.' : 'Informe seu e-mail.' : target.value ? '' : 'Informe sua senha.' : '');
      const formError = loginForm.querySelector('[data-form-error]'); if (formError) formError.textContent = '';
    }
  }
  document.addEventListener('click',e => {
    const servicesLink = e.target.closest('a[href="#/servicos"]');
    if (servicesLink) { closeModal(); return; }
    const legacyHistoryLink = e.target.closest('a[href="#/historico"]');
    if (legacyHistoryLink) { e.preventDefault(); openHistoryModal(); return; }
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
     if (action === 'notifications') { openModal('Notificações', state.orders.length ? `<p class="subtext">Notificações da operação serão exibidas aqui quando houver eventos reais.</p>` : '<p>Nenhuma notificação no momento.</p>'); return; }
       if (action === 'export-report') { if (['OWNER','MANAGER'].includes(ui.session?.role)) exportRevenue(); return; }
     switch (action) {
       case 'inventory-history-modal': openInventoryHistoryModal(); break;
       case 'history-modal': openHistoryModal(); break;
       case 'history-detail': ui.historyDetail = { id, remote:target.dataset.remote === 'true' }; refreshHistoryModal(); break;
       case 'history-detail-close': ui.historyDetail = null; refreshHistoryModal(); break;
       case 'inventory-new': inventoryItemModal(); break;
      case 'inventory-edit': inventoryItemModal(id); break;
      case 'inventory-entry': inventoryMovementModal(id,'ENTRY'); break;
      case 'inventory-exit': inventoryMovementModal(id,'EXIT'); break;
       case 'inventory-retry': if (materialUser()) { ui.inventoryError = ''; ui.inventoryLoaded = false; loadInventory(); if (!document.getElementById('quick-order-form')) render(); } break;
       case 'material-new': materialModal(id); break;
       case 'order-reserve-material': reservationModal(id); break;
       case 'release-order-reservation': releaseOrderReservation(id,target.dataset.reservationId); break;
      case 'material-reverse': materialModal(id,target.dataset.materialId); break;
      case 'materials-retry': if (materialUser()) { ui.materialsCache.delete(String(id)); loadOrderMaterials(id); render(); } break;
      case 'theme': applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); break;
      case 'menu': document.getElementById('layout')?.classList.toggle('menu-visible'); break;
      case 'collapse': if (innerWidth <= 760) document.getElementById('layout')?.classList.remove('menu-visible'); else { ui.collapsed = !ui.collapsed; render(); } break;
      case 'close-modal': closeModal(); break;
      case 'logout': logout(); break;
      case 'go-home': navigate('dashboard'); break;
       case 'new-order': openCreateOrderModal(target.dataset); break;
       case 'print-order': printOrder(id); break;
       case 'new-quick-order': openCreateOrderModal(); break;
       case 'add-create-part': document.getElementById('create-parts-list')?.insertAdjacentHTML('beforeend',createPartRow()); break;
       case 'add-create-labor': document.getElementById('create-labor-list')?.insertAdjacentHTML('beforeend',createLaborRow()); break;
       case 'add-create-pending': document.getElementById('create-pending-list')?.insertAdjacentHTML('beforeend',createPendingRow()); break;
       case 'remove-create-row': target.closest('.create-line-item')?.remove(); updateCreateSummary(target.closest('form')); break;
      case 'quick-order-created-open': { const quickId = target.dataset.id; ui.quickCreatedOrder = null; closeModal(); navigate(`ordens/${quickId}`); break; }
       case 'quick-order-created-continue': ui.quickCreatedOrder = null; closeModal(); render(); break;
       case 'quick-order-status': updateQuickOrderStatus(id,Number(target.dataset.status)); break;
        case 'deliver-order': confirmServerDelivery(id); break;
       case 'deliver-local-order': openModal(`Entregar veículo · OS #${id}`,'<p>Confirme a retirada do veículo pelo cliente. A OS será encerrada e permanecerá disponível no Histórico.</p>',`${btn('Voltar','close-modal','','ghost')}${btn('Confirmar entrega','confirm-delivery','check','primary',`data-id="${id}" data-local="true"`)}`); break;
       case 'confirm-delivery': closeModal(); if (target.dataset.local === 'true') deliverLocalOrder(id); else deliverServerOrder(id); break;
       case 'reopen-order': reopenServerOrder(id); break;
       case 'cancel-server-order': cancelServerOrder(id); break;
       case 'set-local-status': if (o) setStatus(o,Number(target.dataset.status)); break;
       case 'open-order': closeModal(); navigate(`ordens/${target.dataset.remote === 'true' || String(id).startsWith('local-') ? '' : 'local-'}${id}`); break;
      case 'view-board': ui.view = 'board'; render(); break;
      case 'view-list': ui.view = 'list'; render(); break;
       case 'patio-minimize': ui.patioMinimized = true; ui.patioExpanded = false; render(); break;
       case 'patio-maximize': ui.patioMinimized = false; ui.patioExpanded = true; render(); break;
       case 'patio-restore': ui.patioMinimized = false; ui.patioExpanded = false; render(); break;
       case 'toggle-kanban-card': toggleKanbanCard(target.dataset.cardKey); break;
       case 'toggle-kanban-all': toggleAllKanbanCards(); break;
      case 'reset-filters': ui.query = ui.mechanic = ui.status = ui.priority = ''; ui.tab = 'Todas'; render(); break;
      case 'order-tab': ui.tab = target.dataset.tab; render(); break;
      case 'change-status': statusModal(o); break;
      case 'note': noteModal(o); break;
      case 'problem': noteModal(o,true); break;
      case 'photo': photoUpload(o); break;
      case 'diagnosis': openModal('Diagnóstico do veículo',`<form id="diagnosis-form" data-id="${id}"><label class="field">Avaliação técnica<textarea name="diagnosis" required maxlength="2000">${esc(o.diagnosis || '')}</textarea></label></form>`,`<button class="btn primary" type="submit" form="diagnosis-form">Salvar diagnóstico</button>`); break;
      case 'add-service': openModal('Adicionar serviço ao orçamento',`<form id="service-form" data-id="${id}" class="form-grid"><label class="field full">Descrição<input name="name" required maxlength="120"></label><label class="field full">Valor (R$)<input name="value" required type="number" min="0" max="100000" step="0.01"></label></form>`,`<button type="submit" form="service-form" class="btn primary">Adicionar serviço</button>`); break;
      case 'add-part': openModal('Adicionar peça ou material',`<form id="part-form" data-id="${id}" class="form-grid"><label class="field full">Peça<input name="name" required maxlength="100"></label><label class="field full">Quantidade<input name="qty" type="number" min="1" max="999" step="1" required value="1"></label><p class="muted">Peça incluída no valor atual do orçamento. Para custos adicionais, adicione um serviço com o valor correspondente.</p></form>`,`<button type="submit" form="part-form" class="btn primary">Registrar peça</button>`); break;
       case 'order-chat':
       case 'client-chat': toast('WhatsApp não está conectado à oficina. Nenhuma mensagem foi enviada.',true); break;
      case 'select-chat': ui.chat = Number(id); ui.chatList = false; state.conversations.find(c => c.id === ui.chat).unread = 0; save(); render(); break;
      case 'chat-list': ui.chatList = true; render(); break;
      case 'chat-context': openModal('Dados do atendimento',`<div class="chat-context" style="display:block;border:0;padding:0">${chatContext(state.conversations.find(c => c.id === ui.chat))}</div>`); break;
      case 'notifications': openModal('Central de notificações',state.settings.notifications ? `${!state.readNotifications ? '<p class="subtext">O que merece sua atenção agora.</p>' : '<p class="subtext">Todas as notificações foram lidas.</p>'}${[{title:'Cliente aprovou orçamento',text:'OS #1048 · Corolla ABC1D23',id:1048,icon:'checkCircle'},{title:'Peça ainda não chegou',text:'OS #1029 · Civic DEF2A19',id:1029,icon:'box'},{title:'Veículo pronto há 2h',text:'OS #1035 · Hilux GHI5J72',id:1035,icon:'car'}].map(n => `<button class="notification-item" data-action="open-order" data-id="${n.id}"><span class="activity-icon amber">${icon(n.icon)}</span><div><strong>${n.title}</strong><p>${n.text}</p><small>Exemplo do dia de demonstração</small></div></button>`).join('')}<a href="#/whatsapp" class="notification-item" data-action="close-modal"><span class="activity-icon blue">${icon('chat')}</span><div><strong>Novo atendimento via WhatsApp</strong><p>Ana Souza · Chevrolet Onix</p></div></a>` : '<p>As notificações estão desativadas. Você pode ativá-las em Configurações.</p>',btn('Marcar todas como lidas','read-notifications','check','primary')); break;
      case 'read-notifications': state.readNotifications = true; save(); closeModal(); render(); toast('Notificações marcadas como lidas.'); break;
      case 'global-search': openModal('Buscar no GIRO',`${search('Placa, cliente ou número da OS','modal-search')}<div id="global-results" style="margin-top:18px">${empty('Encontre o que precisa','Digite para buscar nas ordens de serviço.')}</div>`); setTimeout(() => document.getElementById('modal-search')?.focus(),50); break;
      case 'new-client': openModal('Novo cliente',`<form id="client-form" class="form-grid"><label class="field full">Nome completo<input name="name" required minlength="3" maxlength="80"></label><label class="field">WhatsApp<input name="phone" type="tel" required pattern="[0-9()+ \\-]{10,20}" placeholder="(51) 99999-9999"></label><label class="field">E-mail<input name="email" type="email" required></label></form>`,`<button class="btn primary" type="submit" form="client-form">Cadastrar cliente</button>`); break;
      case 'mileage': openModal('Atualizar quilometragem',`<form id="mileage-form" data-id="${id}"><label class="field">Quilometragem atual<input name="km" type="number" required min="${vehicle(id).km}" max="2000000" value="${vehicle(id).km}"></label></form>`,`<button type="submit" form="mileage-form" class="btn primary">Atualizar</button>`); break;
        case 'new-member': openModal('Adicionar funcionário',`<form id="member-form" class="form-grid"><label class="field full">Nome completo<input name="name" required minlength="3" maxlength="80" autocomplete="name"></label><label class="field">E-mail<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label class="field">Telefone<input name="phone" type="tel" maxlength="30" autocomplete="tel"></label><label class="field full">Função<select name="role" required><option value="MANAGER">Gerente</option><option value="ATTENDANT">Atendente</option><option value="MECHANIC" selected>Mecânico</option></select></label></form><p class="integration-note">Enviaremos um convite por e-mail. O funcionário criará a própria senha.</p>`,`<button class="btn primary" type="submit" form="member-form">${icon('send')}Enviar convite</button>`); break;
       case 'resend-invitation': resendInvitation(id); break;
       case 'deactivate-member': updateTeamMember(id,false); break;
       case 'member-work': ui.mechanic = id; ui.tab = 'Todas'; ui.query = ui.status = ui.priority = ''; navigate(`servicos?m=${id}`); break;
       case 'revenue-refresh': ui.revenueFrom = document.getElementById('revenue-from')?.value || ui.revenueFrom; ui.revenueTo = document.getElementById('revenue-to')?.value || ui.revenueTo; ui.revenueMechanic = document.getElementById('revenue-mechanic')?.value || ''; ui.revenueReport = null; ui.revenueError = ''; loadRevenueReport(); break;
       case 'revenue-retry': ui.revenueError = ''; loadRevenueReport(); render(); break;
      case 'report-period': ui.report = Number(target.dataset.days); render(); break;
       case 'settings-tab': ui.settings = target.dataset.tab; render(); break;
       case 'service-template-new': serviceTemplateModal(); break;
       case 'service-template-edit': serviceTemplateModal(id); break;
       case 'reset-demo': openModal('Limpar dados locais?', '<p>Os registros desta oficina neste navegador serão removidos. Esta ação não pode ser desfeita.</p>', `${btn('Cancelar','close-modal','','ghost')}${btn('Limpar dados','confirm-reset','history','danger')}`); break;
       case 'confirm-reset': state = emptyState(ui.session || {}); save(); ui.chat = 1; closeModal(); render(); toast('Dados locais removidos.'); break;
      case 'toggle-password': { const input = target.closest('.password-field')?.querySelector('input'); if (!input) break; input.type = input.type === 'password' ? 'text' : 'password'; target.setAttribute('aria-label',input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha'); break; }
      case 'signup-back': ui.signup--; render(); break;
      case 'export-orders': exportCSV([['OS','Veículo','Placa','Cliente','Serviço','Mecânico','Status','Valor','Entrada','Previsão'],...filteredOrders().map(o => { const v = vehicle(o.vehicle); return [o.id,`${v.brand} ${v.model}`,v.plate,client(v.client).name,o.service,member(o.mechanic).name,statuses[o.status].name,o.value,o.entry,o.due]; })],'giro-ordens.csv'); break;
        case 'export-report': exportRevenue(); break;
    }
  });
  document.addEventListener('input',e => {
    if (e.target.form?.id === 'quick-order-form') {
      if (e.target.name === 'phone') {
        const digitsBeforeCaret = phoneDigits(e.target.value.slice(0,e.target.selectionStart)).length;
        e.target.value = formatBrazilianPhone(e.target.value);
        const caret = phoneCaretPosition(e.target.value,digitsBeforeCaret); e.target.setSelectionRange(caret,caret);
      }
      updateCreateSummary(e.target.form);
    }
    if (e.target.id === 'history-search') { ui.historyQuery = e.target.value; refreshHistoryModal(); document.getElementById('history-search')?.focus(); return; }
    if (e.target.form?.id === 'quick-order-edit-form' && !e.target.disabled) e.target.dataset.dirty = 'true';
    if (e.target.id === 'inventory-search') { ui.inventoryQuery = e.target.value; const results = document.getElementById('inventory-results'); if (results) results.innerHTML = inventoryRows(); return; }
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
    if (e.target.id === 'modal-search') {
      const q = e.target.value.trim().toLocaleLowerCase('pt-BR');
      const localMatches = q ? state.orders.filter(item => { const v=vehicle(item.vehicle), c=client(v.client); return `${item.id} ${v.plate} ${v.brand} ${v.model} ${c.name}`.toLocaleLowerCase('pt-BR').includes(q); }).map(item => ({ id:item.id,local:true,vehicle:`${vehicle(item.vehicle).brand} ${vehicle(item.vehicle).model}`,plate:vehicle(item.vehicle).plate,client:client(vehicle(item.vehicle).client).name })) : [];
      const remoteMatches = q ? ui.serverOrders.filter(item => `${item.id} ${item.plate} ${item.vehicleBrand} ${item.vehicleModel} ${item.clientName}`.toLocaleLowerCase('pt-BR').includes(q)).map(item => ({ id:item.id,vehicle:[item.vehicleBrand,item.vehicleModel].filter(Boolean).join(' ') || 'Veículo não informado',plate:item.plate || 'Placa não informada',client:item.clientName || 'Cliente não informado' })) : [];
      const matches = [...localMatches,...remoteMatches];
      const results = document.getElementById('global-results');
      if (results) results.innerHTML = matches.length ? matches.map(item => `<button class="notification-item" data-action="open-order" data-id="${esc(item.id)}" data-remote="${!item.local}">${icon('car')}<span><strong>#${esc(item.id)} · ${esc(item.vehicle)}</strong><p>${esc(item.plate)} · ${esc(item.client)}</p></span></button>`).join('') : empty();
    }
  });
  document.addEventListener('change',e => {
    if (!['revenue-from','revenue-to','revenue-mechanic'].includes(e.target.id)) return;
    ui.revenueFrom = document.getElementById('revenue-from')?.value || ui.revenueFrom;
    ui.revenueTo = document.getElementById('revenue-to')?.value || ui.revenueTo;
    ui.revenueMechanic = document.getElementById('revenue-mechanic')?.value || '';
    ui.revenueReport = null; ui.revenueError = ''; loadRevenueReport();
  });
  document.addEventListener('change',e => {
    if (e.target.form?.id === 'quick-order-form') {
      const form = e.target.form;
      if (e.target.matches('[data-mechanic-service-select]')) {
        const row=e.target.closest('[data-labor-row]'), item=ui.serviceTemplates.find(item=>item.id===e.target.value);
        if (row) { row.dataset.templateId=item?.id || ''; row.querySelector('[name="laborDescription"]').value=item?.name || ''; row.querySelector('[name="laborValue"]').value=item?.defaultPrice ?? 0; }
      }
      if (e.target.name === 'clientName') {
        const found = [...ui.workshopClients,...state.clients].find(item => normalizeSearch(item.name) === normalizeSearch(e.target.value));
        if (found) form.elements.phone.value = found.phone || '';
      }
      if (e.target.name === 'plate') {
        const value = e.target.value.trim().toUpperCase();
        const found = [...ui.workshopVehicles,...state.vehicles].find(item => String(item.plate || '').toUpperCase() === value);
        if (found) { form.elements.vehicleBrand.value = found.brand || ''; form.elements.vehicleModel.value = found.model || ''; form.elements.plate.value = found.plate || ''; const owner = ui.workshopClients.find(client => String(client.id) === String(found.clientId)) || client(found.client); if (owner?.name) { form.elements.clientName.value = owner.name; form.elements.phone.value = owner.phone || ''; } }
      }
      updateCreateSummary(form);
    }
    if (e.target.id === 'history-mechanic') { ui.historyMechanic = e.target.value; refreshHistoryModal(); return; }
    if (e.target.id === 'history-from') { ui.historyFrom = e.target.value; refreshHistoryModal(); return; }
    if (e.target.id === 'history-to') { ui.historyTo = e.target.value; refreshHistoryModal(); return; }
    if (e.target.form?.id === 'quick-order-edit-form' && !e.target.disabled) e.target.dataset.dirty = 'true';
    if (e.target.id === 'inventory-filter') { ui.inventoryFilter = e.target.value; const results = document.getElementById('inventory-results'); if (results) results.innerHTML = inventoryRows(); return; }
    if (e.target.id === 'material-source') { updateMaterialSource(); return; }
    if (e.target.id === 'material-catalog') {
      const form = e.target.form, item = ui.inventoryItems.find(item => String(item.id) === e.target.value);
      form.elements.name.value = item?.name || ''; form.elements.unit.value = item?.unit || 'UN';
      form.elements.name.readOnly = Boolean(item); form.elements.unit.disabled = Boolean(item); return;
    }
    if (e.target.name === 'tracked' && e.target.form?.id === 'inventory-item-form') {
      const { minimumQuantity,initialQuantity } = e.target.form.elements;
      minimumQuantity.disabled = initialQuantity.disabled = !e.target.checked;
      if (!e.target.checked) initialQuantity.value = '0';
      return;
    }
    const map = { 'mechanic-filter':'mechanic', 'status-filter':'status', 'priority-filter':'priority' };
    if (map[e.target.id]) { ui[map[e.target.id]] = e.target.value; updateResults(); }
    if (e.target.id === 'notification-setting') { state.settings.notifications = e.target.checked; save(); toast('Preferência salva.'); }
    handleAuthFieldChange(e.target);
  });
  document.addEventListener('focusout',e => { if (e.target.closest?.('#signup-form,#login-form,#recovery-form,#reset-password-form')) handleAuthFieldChange(e.target,true); });
  document.addEventListener('submit',async e => {
    const form = e.target; if (!form.id) return; e.preventDefault();
    if (ui.submitting && ['login-form','signup-form','recovery-form','reset-password-form'].includes(form.id)) return;
    const d = Object.fromEntries(new FormData(form)); for (const key of Object.keys(d)) if (typeof d[key] === 'string' && !['password','passwordConfirmation'].includes(key)) d[key] = d[key].trim();
    if (['inventory-item-form','inventory-movement-form','material-form','material-reverse-form'].includes(form.id)) { await submitInventoryForm(form,d); return; }
    if (form.id === 'register-vehicle-form') { await registerVehicleFromOrder(form); return; }
    if (!['login-form','signup-form','recovery-form','reset-password-form'].includes(form.id) && [...form.querySelectorAll('[required]')].some(field => typeof field.value === 'string' && !field.value.trim())) { toast('Preencha os campos obrigatórios.',true); return; }
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
          ui.loginErrors = {}; resetWorkshopCache(); ui.session = data.user; ui.authChecked = true; loadUserState(data.user); setAuthSubmitting(form,false); navigate('dashboard'); render(); toast('Login realizado com sucesso.');
        } catch (_) {
          ui.loginErrors.form = 'Não foi possível conectar ao servidor. Tente novamente.'; form.querySelector('[data-form-error]').textContent = ui.loginErrors.form; setAuthSubmitting(form,false);
        }
        return;
      }
      case 'recovery-form': {
        const values = validateRecovery(form,true); if (!values.valid) return;
        setAuthSubmitting(form,true,'Enviando...');
        try {
          const { response,data } = await authRequest('/api/auth/forgot-password',{ email:values.email });
          if (!response.ok) {
            if (data.fields) Object.entries(data.fields).forEach(([name,error]) => setFieldError(form,name,error));
            form.querySelector('[data-form-error]').textContent = data.error || 'Não foi possível solicitar a recuperação agora.';
            setAuthSubmitting(form,false); return;
          }
          setAuthSubmitting(form,false);
          navigate('recuperacao-enviada');
        } catch (_) {
          form.querySelector('[data-form-error]').textContent = 'Não foi possível conectar ao servidor. Tente novamente.'; setAuthSubmitting(form,false);
        }
        return;
      }
      case 'activate-account-form': {
        const token = activationTokenFromHash(), values = validateResetPassword(form,true);
        if (!token) { form.querySelector('[data-form-error]').textContent = 'Convite inválido ou expirado.'; return; }
        if (!values.valid) return;
        setAuthSubmitting(form,true,'Ativando conta...');
        try {
          const { response,data } = await authRequest('/api/auth/activate',{ token,password:values.password,confirmPassword:values.confirmPassword });
          if (!response.ok) { if (data.fields) Object.entries(data.fields).forEach(([name,error]) => setFieldError(form,name,error)); form.querySelector('[data-form-error]').textContent = data.error || 'Não foi possível ativar a conta.'; setAuthSubmitting(form,false); return; }
          ui.activationDone = true; ui.activationError = ''; ui.submitting = false; render();
        } catch (_) { form.querySelector('[data-form-error]').textContent = 'Não foi possível conectar ao servidor. Tente novamente.'; setAuthSubmitting(form,false); }
        return;
      }
      case 'reset-password-form': {
        const token = d.token || resetTokenFromHash();
        if (!token) { form.querySelector('[data-form-error]').textContent = 'Link de redefinição inválido ou incompleto.'; return; }
        const values = validateResetPassword(form,true); if (!values.valid) return;
        setAuthSubmitting(form,true,'Redefinindo...');
        try {
          const { response,data } = await authRequest('/api/auth/reset-password',{ token,password:values.password,confirmPassword:values.confirmPassword });
          if (!response.ok) {
            if (data.fields) Object.entries(data.fields).forEach(([name,error]) => name !== 'token' && setFieldError(form,name,error));
            form.querySelector('[data-form-error]').textContent = data.error || 'Não foi possível redefinir a senha.';
            setAuthSubmitting(form,false); return;
          }
          setAuthSubmitting(form,false);
          const notice = document.querySelector('[data-reset-success]');
          if (notice) { notice.hidden = false; notice.textContent = data.message || 'Senha alterada com sucesso.'; }
          form.querySelectorAll('input,button').forEach(control => { control.disabled = true; });
          setTimeout(() => navigate('login'),2500);
        } catch (_) {
          form.querySelector('[data-form-error]').textContent = 'Não foi possível conectar ao servidor. Tente novamente.'; setAuthSubmitting(form,false);
        }
        return;
      }
       case 'quick-order-form': {
         if (form.dataset.sending === 'true' || String(ui.session?.id) !== form.dataset.userId || Number(form.dataset.generation) !== ui.workshopGeneration) return;
         const requestedUserId = ui.session.id, generation = ui.workshopGeneration;
         let payload;
         try { payload = form.quickSubmission || createOrderPayload(form); } catch (error) { form.querySelector('[data-quick-error]').textContent = error.message; return; }
        form.quickSubmission = payload;
        const controls = [...form.elements,...modal.querySelectorAll('.modal-footer button,.modal-header button')];
        const previousDisabled = form.quickDisabledControls || new Map(controls.map(control => [control,control.disabled]));
        form.quickDisabledControls = previousDisabled;
        form.dataset.sending = 'true'; form.setAttribute('aria-busy','true'); controls.forEach(control => { control.disabled = true; });
        form.querySelector('[data-quick-error]').textContent = '';
        let responseReceived = false;
        try {
          const { response,data } = await apiRequest('/api/orders/quick',{ method:'POST',body:payload });
          responseReceived = true;
          if (ui.session?.id !== requestedUserId || generation !== ui.workshopGeneration) return;
          if (!response.ok) {
            const conflict = response.status === 409 && /operationId|idempot/i.test(data.error || '');
            form.dataset.outcomeUnknown = String(conflict);
            if (!conflict) form.quickSubmission = null;
            throw new Error(conflict ? 'Conflito no identificador da operação. Confira as ordens existentes antes de criar outra OS.' : data.error || 'Não foi possível criar a OS.');
          }
            ui.serverOrders = [data.order,...ui.serverOrders.filter(order => String(order.id) !== String(data.order.id))]; ui.serverOrdersLoaded = true;
            if (data.client && !ui.workshopClients.some(item => item.id === data.client.id)) ui.workshopClients.push(data.client);
            if (data.vehicle && !ui.workshopVehicles.some(item => item.id === data.vehicle.id)) ui.workshopVehicles.push(data.vehicle);
            ui.workshopVehiclesLoaded = false;
           const reservations = payload.reservationParts || [];
           let reservationError = '';
           try { const created = await reserveCreateParts(data.order.id,reservations); data.order = { ...data.order,reservations:[...(data.order.reservations || []),...created] }; ui.serverOrders = ui.serverOrders.map(item => String(item.id) === String(data.order.id) ? data.order : item); }
           catch (error) { reservationError = error.message || 'Não foi possível reservar todas as peças.'; }
           form.dataset.sending = 'false'; form.dataset.outcomeUnknown = 'false'; form.quickSubmission = null; closeModal();
           if (reservationError) { toast(`OS #${data.order.id} criada, mas ${reservationError}`,true); navigate(`ordens/${data.order.id}`); }
           else openModal(esc(data.message || `OS #${data.order.id} criada com sucesso.`),`<p>Ordem de Serviço criada com status <strong>Entrada</strong>.</p>${data.order.incomplete ? '<p class="integration-note">Cadastro incompleto · complete os dados depois.</p>' : ''}`,`${btn('Continuar depois','quick-order-created-continue','','ghost')}${btn('Abrir OS','quick-order-created-open','arrow','primary',`data-id="${esc(data.order.id)}"`)}`);
        } catch (error) {
          if (ui.session?.id === requestedUserId && generation === ui.workshopGeneration) {
            if (!responseReceived) form.dataset.outcomeUnknown = 'true';
            form.querySelector('[data-quick-error]').textContent = responseReceived ? error.message : 'Envio não confirmado: a OS pode já ter sido criada. Clique novamente em confirmar para recuperar a mesma operação, sem duplicar.';
          }
        } finally {
          form.dataset.sending = 'false'; form.removeAttribute('aria-busy');
          controls.forEach(control => { control.disabled = form.dataset.outcomeUnknown === 'true' ? !(control.form === form && control.matches('button[type="submit"]')) : previousDisabled.get(control); });
          if (form.dataset.outcomeUnknown !== 'true') form.quickDisabledControls = null;
        }
        return;
      }
      case 'quick-order-edit-form': await saveQuickOrderEdit(form); return;
      case 'order-reservation-form': {
        const reservation = { itemId:d.itemId, quantity:Number(d.quantity), operationId:form.dataset.operationId }, errorField = form.querySelector('[data-inventory-error]');
        if (!reservation.itemId || !Number.isFinite(reservation.quantity) || reservation.quantity <= 0) { errorField.textContent = 'Informe item e quantidade válidos.'; return; }
        try { const { response,data } = await apiRequest(`/api/orders/${encodeURIComponent(form.dataset.id)}/reservations`,{ method:'POST',body:reservation }); if (!response.ok) throw new Error(data.error || 'Não foi possível reservar a peça.'); ui.serverOrders = ui.serverOrders.map(order => String(order.id) === String(form.dataset.id) ? { ...order,reservations:data.reservations || [] } : order); if (data.item) ui.inventoryItems = ui.inventoryItems.map(item => String(item.id) === String(data.item.id) ? data.item : item); closeModal(); render(); toast('Peça reservada.'); } catch (error) { errorField.textContent = error.message || 'Não foi possível reservar a peça.'; }
        return;
      }
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
       case 'new-order-form': { const v = vehicle(d.vehicle); if (!v) return; const due = new Date(d.due); const newId = Math.max(0,...state.orders.map(o => o.id))+1; const now = new Date(); state.orders.unshift({ id:newId, vehicle:Number(d.vehicle),service:d.service,issue:d.issue,mechanic:Number(d.mechanic),priority:d.priority,value:Number(d.value),status:Number(d.status),createdAt:now.toISOString(),due:due.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),entry:now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),elapsed:'Agora',notes:[],photos:[],extraServices:[],history:[{text:'Ordem de serviço criada',date:now.toLocaleString('pt-BR')}],paused:false,late:false }); save(); closeModal(); navigate(`ordens/${newId}`); toast(`OS #${newId} criada com sucesso.`); return; }
      case 'status-form': closeModal(); if (Number(d.status) === 6 && o.status !== 6) confirmFinish(o); else setStatus(o,Number(d.status)); return;
      case 'note-form': o.notes.push({text:d.text,problem:form.dataset.problem === 'true',date:new Date().toLocaleString('pt-BR'),author:state.settings.name}); log(o,form.dataset.problem === 'true' ? 'Problema encontrado registrado' : 'Observação adicionada'); break;
      case 'diagnosis-form': o.diagnosis = d.diagnosis; log(o,'Diagnóstico atualizado'); break;
      case 'service-form': o.extraServices.push({name:d.name,value:Number(d.value)}); o.value += Number(d.value); log(o,`Serviço adicionado: ${d.name}`); break;
      case 'part-form': (o.parts ||= []).push({name:d.name,qty:Number(d.qty)}); log(o,`Peça registrada: ${d.name}`); break;
      case 'message-form': { const c = state.conversations.find(c => c.id === ui.chat); c.messages.push({who:'attendant',text:d.message,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}); save(); render(); document.querySelector('[name="message"]')?.focus(); return; }
      case 'client-form': state.clients.push({id:Math.max(0,...state.clients.map(c => c.id))+1,...d}); break;
      case 'mileage-form': vehicle(form.dataset.id).km = Number(d.km); break;
       case 'member-form': {
         try {
           const { response,data } = await apiRequest('/api/team',{ method:'POST',body:{ name:d.name,email:d.email,phone:d.phone,role:d.role } });
           if (!response.ok) { if (data.user) { ui.teamMembers.push(data.user); ui.teamLoaded = true; closeModal(); render(); } toast(data.error || 'Não foi possível enviar o convite.',true); return; }
           ui.teamMembers.push(data.user); ui.teamLoaded = true; closeModal(); render(); toast(data.message || 'Convite enviado.');
         } catch (_) { toast('Não foi possível conectar ao servidor para enviar o convite.',true); }
         return;
       }
       case 'service-template-form': {
         const body={name:d.name.trim(),defaultPrice:Number(d.defaultPrice),active:Boolean(form.elements.active.checked)}; const id=form.dataset.id; const result=await apiRequest(`/api/service-templates${id?`/${encodeURIComponent(id)}`:''}`,{method:id?'PATCH':'POST',body}); if(!result.response.ok) { form.querySelector('[data-template-error]').textContent=result.data.error || 'Não foi possível salvar o serviço.'; return; } const item=result.data.serviceTemplate; ui.serviceTemplates=id?ui.serviceTemplates.map(old=>old.id===id?item:old):[...ui.serviceTemplates,item]; closeModal(); render(); toast('Serviço salvo.'); return;
       }
      case 'settings-form': Object.assign(state.settings,d); break;
      default: return;
    }
    const persisted = save(); closeModal(); render(); if (persisted) toast('Alterações salvas com sucesso.');
  });
  let draggedKey = null;
  document.addEventListener('dragstart',e => { const card = e.target.closest('.kanban-card[draggable="true"]'); if (!card) return; draggedKey = card.dataset.orderKey; e.dataTransfer.setData('text/plain',draggedKey); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
  document.addEventListener('dragover',e => { const column = e.target.closest('[data-drop-status]'); if (!column || !draggedKey) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; column.classList.add('drag-over'); });
  document.addEventListener('dragleave',e => { const col = e.target.closest('[data-drop-status]'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
  document.addEventListener('drop',e => { const col = e.target.closest('[data-drop-status]'); if (!col || !draggedKey) return; e.preventDefault(); const key=draggedKey, status=Number(col.dataset.dropStatus); draggedKey=null; document.querySelectorAll('.drag-over,.dragging').forEach(el => el.classList.remove('drag-over','dragging')); if (key.startsWith('server:')) updateQuickOrderStatus(key.slice(7),status); else { const o=order(key.slice(6)); if (o) setStatus(o,status); } });
  document.addEventListener('dragend',() => { draggedKey = null; document.querySelectorAll('.dragging,.drag-over').forEach(el => el.classList.remove('dragging','drag-over')); });
  modal.addEventListener('click',e => { if (e.target === modal) { if (modal.classList.contains('history-modal')) closeModal(); else { const rect = modal.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) closeModal(); } } });
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
    if (e.key === 'Escape' && modal.open && modal.classList.contains('history-modal')) { e.preventDefault(); closeModal(); return; }
    if (e.key === 'Escape' && ui.patioExpanded && !modal.open) { e.preventDefault(); ui.patioExpanded = false; render(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.querySelector('[data-action="global-search"]')?.click(); }
    if (e.key === 'Escape') document.getElementById('layout')?.classList.remove('menu-visible');
  });
  window.addEventListener('hashchange',() => {
    closeModal(); ui.query = ui.status = ui.priority = ui.mechanic = ''; ui.tab = 'Todas';
    // A seleção de mecânico pode ser compartilhada por URL.
    if (location.hash.includes('servicos?m=')) ui.mechanic = new URLSearchParams(location.hash.split('?')[1]).get('m') || '';
    render(); window.scrollTo(0,0);
  });
  window.addEventListener('focus',() => {
    if (!ui.session || ui.serverOrdersLoading) return;
    ui.serverOrdersLoaded = false;
    loadServerOrders();
    if (['OWNER','MANAGER'].includes(ui.session.role)) ui.workshopVehiclesLoaded = false;
  });
  window.setInterval(() => {
    if (!ui.session || ui.serverOrdersLoading || document.hidden) return;
    ui.serverOrdersLoaded = false;
    loadServerOrders();
  },30000);
  if (route()[0] === 'servicos' && location.hash.includes('?m=')) ui.mechanic = new URLSearchParams(location.hash.split('?')[1]).get('m') || '';
  render();
})();
