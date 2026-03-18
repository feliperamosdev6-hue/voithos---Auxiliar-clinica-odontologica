const state = {
  agendamentos: [],
};
const appApi = window.appApi || {};
const agendaApi = appApi.agenda || {};

const faltasCount = document.getElementById('faltas-count');
const desmarcadosCount = document.getElementById('desmarcados-count');
const agendadosList = document.getElementById('agendados-list');
const faltasList = document.getElementById('faltas-list');
const desmarcadosList = document.getElementById('desmarcados-list');

const toIso = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeAppt = (a) => ({
  id: a.id || '',
  paciente: a.paciente || a.pacienteNome || 'Paciente',
  data: a.data || '',
  horaInicio: a.horaInicio || '',
  horaFim: a.horaFim || '',
  status: a.status || 'em_aberto',
  desmarcado: Boolean(a.desmarcado),
  tipo: a.tipo || '',
  dentista: a.dentistaNome || '',
});

const buildCard = (appt, actions = []) => {
  const meta = [
    appt.data ? `Data: ${appt.data}` : null,
    appt.horaInicio ? `Horario: ${appt.horaInicio}` : null,
    appt.tipo ? `Tipo: ${appt.tipo}` : null,
    appt.dentista ? `Dentista: ${appt.dentista}` : null,
  ].filter(Boolean).join(' • ');

  const actionsHtml = actions.length
    ? `<div class="appt-actions">${actions.join('')}</div>`
    : '';

  return `
    <article class="appt-card" data-id="${appt.id}">
      <h4>${appt.paciente}</h4>
      <div class="appt-meta">${meta || 'Sem detalhes adicionais'}</div>
      ${actionsHtml}
    </article>
  `;
};

const emptyBlock = (label) => `
  <div class="empty-card">${label}</div>
`;

const render = () => {
  const faltas = state.agendamentos.filter((a) => a.status === 'nao_compareceu');
  const desmarcados = state.agendamentos.filter((a) => a.desmarcado);
  const agendados = state.agendamentos.filter((a) => !a.desmarcado && ['em_aberto', 'confirmado'].includes(a.status));

  if (faltasCount) faltasCount.textContent = String(faltas.length);
  if (desmarcadosCount) desmarcadosCount.textContent = String(desmarcados.length);

  if (agendadosList) {
    agendadosList.innerHTML = agendados.length
      ? agendados.map((appt) => buildCard(appt, [
        '<button class="danger" type="button" data-action="falta">Marcar falta</button>',
        '<button class="ghost" type="button" data-action="desmarcado">Desmarcou</button>',
      ])).join('')
      : emptyBlock('Sem agendamentos recentes.');
  }

  if (faltasList) {
    faltasList.innerHTML = faltas.length
      ? faltas.map((appt) => buildCard(appt, [
        '<button class="primary" type="button" data-action="reagendar">Reagendado</button>',
      ])).join('')
      : emptyBlock('Nenhuma falta registrada.');
  }

  if (desmarcadosList) {
    desmarcadosList.innerHTML = desmarcados.length
      ? desmarcados.map((appt) => buildCard(appt, [
        '<button class="primary" type="button" data-action="retomar">Reagendar</button>',
      ])).join('')
      : emptyBlock('Nenhum desmarcado registrado.');
  }
};

const loadAgendamentos = async () => {
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 30);
  const end = new Date();
  end.setDate(today.getDate() + 30);

  try {
    const data = await agendaApi.getRange?.({ start: toIso(start), end: toIso(end) });
    const list = Array.isArray(data) ? data.map(normalizeAppt) : [];
    state.agendamentos = list.filter((a) => a.id);
  } catch (_err) {
    state.agendamentos = [];
  }
};

const updateAppt = async (id, changes) => {
  if (!id) return;
  try {
    await agendaApi.update?.(id, changes);
    await loadAgendamentos();
    render();
  } catch (_err) {
    alert('Nao foi possivel atualizar o agendamento.');
  }
};

const setupActions = () => {
  document.addEventListener('click', (ev) => {
    const target = ev.target;
    const button = target instanceof HTMLElement ? target.closest('[data-action]') : null;
    if (!button) return;
    const card = button.closest('.appt-card');
    const id = card?.dataset?.id || '';
    const action = button.dataset.action;
    if (!id || !action) return;

    if (action === 'falta') {
      updateAppt(id, { status: 'nao_compareceu', desmarcado: false });
    } else if (action === 'desmarcado') {
      updateAppt(id, { desmarcado: true });
    } else if (action === 'reagendar') {
      updateAppt(id, { status: 'confirmado', desmarcado: false });
    } else if (action === 'retomar') {
      updateAppt(id, { desmarcado: false, status: 'em_aberto' });
    }
  });

  document.querySelectorAll('[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const el = targetId ? document.getElementById(targetId) : null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
};

const init = async () => {
  await loadAgendamentos();
  render();
  setupActions();
};

init();
