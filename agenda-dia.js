const gerarHorarios = (inicio = 7, fim = 19) => {
  const slots = [];
  for (let hora = inicio; hora <= fim; hora++) {
    const h = String(hora).padStart(2, "0");
    slots.push({ inicio: `${h}:00`, fim: `${h}:59` });
  }
  return slots;
};

const timeSlots = gerarHorarios();
let currentDateIso = null;
let editingAppt = null;
let birthdaysToday = [];
let birthdayModalItem = null;

let currentUser = null;
const appApi = window.appApi || {};
const authApi = appApi.auth || {};
const agendaApi = appApi.agenda || {};
const birthdaysApi = appApi.birthdays || {};
const eventsApi = appApi.events || {};

const loadCurrentUser = async () => {
  try {
    currentUser = await authApi.currentUser?.();
  } catch (err) {
    console.warn('[AGENDA] nao foi possivel carregar usuario atual', err);
    currentUser = null;
  }
};

const getUserRole = () => String(currentUser?.tipo || currentUser?.perfil || '').toLowerCase().trim();
const getUserId = () => currentUser?.id || currentUser?.dentistaId || currentUser?.userId || '';
const canSeeAgendamento = (agendamento) => {
  const role = getUserRole();
  if (role === 'admin' || role === 'recepcao' || role === 'recepcionista') return true;
  if (role === 'dentista') {
    return Boolean(getUserId()) && String(agendamento?.dentistaId || '') === String(getUserId());
  }
  return false;
};
const filterAgendamentos = (list) => (list || []).filter(canSeeAgendamento);
const canDeleteAgendamento = () => ['admin', 'recepcionista', 'recepcao'].includes(getUserRole());
const getDeleteErrorMessage = (err) => {
  const message = String(err?.message || '').trim();
  if (/Acesso negado/i.test(message)) return 'Seu perfil nao tem permissao para excluir este agendamento.';
  if (/Agendamento nao encontrado/i.test(message)) return 'Este agendamento nao foi encontrado na agenda local. Pode ser um registro antigo ou ja removido.';
  if (/outra clinica/i.test(message)) return 'Este agendamento pertence a outra clinica e nao pode ser excluido aqui.';
  return 'Nao foi possivel excluir.';
};
const birthdaySection = document.getElementById('birthday-today-section');
const birthdayList = document.getElementById('birthday-today-list');
const birthdayModal = document.getElementById('modal-birthday');
const birthdayModalName = document.getElementById('birthday-modal-name');
const birthdayModalPhone = document.getElementById('birthday-modal-phone');
const birthdayModalStatus = document.getElementById('birthday-modal-status');
const birthdayModalSend = document.getElementById('birthday-modal-send');
const birthdayModalCancel = document.getElementById('birthday-modal-cancel');

const normalizeDateLocal = (value) => {
  if (!value) return '';
  const format = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  if (value instanceof Date) return format(value);
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return format(new Date(Number(y), Number(m) - 1, Number(d)));
  }
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return format(new Date(Number(y), Number(m) - 1, Number(d)));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed);
};

const formatBr = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const normalizeName = (value) => String(value || '').trim().toLowerCase();
const toDigits = (value) => String(value || '').replace(/\D/g, '');

const showToast = (text) => {
  if (typeof window.showToast === 'function') {
    window.showToast(text);
    return;
  }
  alert(text);
};

const closeBirthdayModal = () => {
  birthdayModalItem = null;
  birthdayModal?.classList.add('hidden');
};

const openBirthdayModal = (item) => {
  birthdayModalItem = item || null;
  if (!birthdayModalItem) return;
  if (birthdayModalName) birthdayModalName.textContent = birthdayModalItem.nome || '-';
  if (birthdayModalPhone) birthdayModalPhone.textContent = birthdayModalItem.telefone || '-';
  if (birthdayModalStatus) {
    if (birthdayModalItem.birthdaySentToday) {
      birthdayModalStatus.textContent = 'Enviado hoje';
    } else if (birthdayModalItem.birthdaySentYear) {
      birthdayModalStatus.textContent = 'Enviado este ano';
    } else {
      birthdayModalStatus.textContent = 'Nao enviado';
    }
  }
  if (birthdayModalSend) birthdayModalSend.disabled = birthdayModalItem.birthdaySentYear;
  birthdayModal?.classList.remove('hidden');
};

const getBirthdayForAppointment = (appt) => {
  const apptName = normalizeName(appt?.paciente || '');
  const apptProntuario = String(appt?.prontuario || appt?.pacienteId || appt?.patientId || '').trim();
  return birthdaysToday.find((item) => {
    const sameProntuario = apptProntuario && String(item.prontuario || '') === apptProntuario;
    const sameName = apptName && normalizeName(item.nome) === apptName;
    return sameProntuario || sameName;
  }) || null;
};

const renderBirthdaysSection = () => {
  if (!birthdaySection || !birthdayList) return;
  const withoutAppointment = birthdaysToday.filter((item) => !item.hasAppointment);
  if (!withoutAppointment.length) {
    birthdaySection.classList.add('hidden');
    birthdayList.innerHTML = '';
    return;
  }

  birthdaySection.classList.remove('hidden');
  birthdayList.innerHTML = withoutAppointment.map((item) => `
    <article class="birthday-item" data-birthday-id="${item.patientId || item.prontuario}">
      <div class="meta">
        <strong>${item.nome || 'Paciente'}</strong>
        <span>${item.telefone || 'Sem telefone'}</span>
      </div>
      <button class="btn-birthday-send" data-action="birthday-send" data-patient-id="${item.patientId || item.prontuario}">
        Enviar parabens
      </button>
    </article>
  `).join('');
};

const loadBirthdaysForDate = async () => {
  if (!birthdaysApi.listToday) {
    birthdaysToday = [];
    renderBirthdaysSection();
    return;
  }
  try {
    const data = await birthdaysApi.listToday({ date: currentDateIso });
    birthdaysToday = Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    console.warn('[AGENDA] Falha ao carregar aniversarios do dia', err);
    birthdaysToday = [];
  }
  renderBirthdaysSection();
};

const normalizarStatus = (status) => {
  const key = status || "em_aberto";
  return { key, texto: key.replace("_", " ") };
};

const obterFim = (inicio) => {
  const slot = timeSlots.find((s) => s.inicio === inicio);
  return slot ? slot.fim : inicio;
};

const fecharModalEdicao = () => {
  editingAppt = null;
  document.getElementById("modal-editar").classList.add("hidden");
};

const abrirModalEdicao = (appt) => {
  editingAppt = appt;
  document.getElementById("edit-paciente").value = appt.paciente || "";
  document.getElementById("edit-tipo").value = appt.tipo || "";
  document.getElementById("edit-hora-inicio").value = appt.horaInicio || "";
  document.getElementById("edit-hora-fim").value = appt.horaFim || "";
  document.getElementById("edit-status").value = appt.status || "em_aberto";
  document.getElementById("modal-editar").classList.remove("hidden");
};

document.getElementById("btn-cancelar-edicao").addEventListener("click", fecharModalEdicao);

document.getElementById("btn-salvar-edicao").addEventListener("click", async () => {
  if (!editingAppt) return;
  const payload = {
    ...editingAppt,
    data: currentDateIso,
    paciente: document.getElementById("edit-paciente").value,
    tipo: document.getElementById("edit-tipo").value,
    horaInicio: document.getElementById("edit-hora-inicio").value,
    horaFim: document.getElementById("edit-hora-fim").value,
    status: document.getElementById("edit-status").value,
  };
  await agendaApi.update(editingAppt.id, payload);
  fecharModalEdicao();
  carregarDia();
});

const btnVoltar = document.getElementById("btn-voltar");
if (btnVoltar) btnVoltar.onclick = () => window.close();

const userReady = loadCurrentUser();

eventsApi.receive?.("agenda-day-data", async (date) => {
  await definirData(normalizeDateLocal(date));
});

async function definirData(dateIso) {
  await userReady;
  currentDateIso = normalizeDateLocal(dateIso || new Date());
  document.getElementById("titulo-dia").textContent = `Agenda do dia ${formatBr(currentDateIso)}`;
  await carregarDia();
}

async function carregarDia() {
  await userReady;
  const lista = document.getElementById("lista-horarios");
  lista.innerHTML = "";

  const agendamentos = filterAgendamentos(await agendaApi.getDay(currentDateIso));
  await loadBirthdaysForDate();
  const apptById = new Map(agendamentos.map((a) => [a.id, a]));

  timeSlots.forEach((slot) => {
    const appt = agendamentos.find((a) => a.horaInicio === slot.inicio) || null;

    const row = document.createElement("div");
    row.classList.add("slot-row", "fade-in");
    row.classList.add(appt ? "ocupado" : "livre");
    row.dataset.horario = slot.inicio;

    const time = document.createElement("div");
    time.className = "slot-time";
    time.textContent = `${slot.inicio} - ${slot.fim}`;

    const info = document.createElement("div");
    info.className = "slot-info";

    if (appt) {
      const { key, texto } = normalizarStatus(appt.status);
      const birthdayItem = getBirthdayForAppointment(appt);
      info.innerHTML = `
        <div class="slot-top">
          <strong>${appt.paciente}</strong>
          <span class="hora">${appt.horaInicio} - ${appt.horaFim}</span>
        </div>
        <div class="slot-meta">
          <span>${appt.tipo}</span>
          ${appt.observacoes ? `<small>${appt.observacoes}</small>` : ''}
          ${birthdayItem ? '<span class="birthday-badge" data-action="open-birthday-modal">🎂 Aniversario</span>' : ''}
          <span class="status-badge status-${key}">${texto}</span>
        </div>
        <div class="slot-actions">
          ${birthdayItem ? `<button class="btn-outline" data-action="birthday-send" data-patient-id="${birthdayItem.patientId || birthdayItem.prontuario}">Enviar parabens</button>` : ''}
          <button class="btn-outline btn-editar">Editar</button>
          ${canDeleteAgendamento() ? '<button class="btn-danger btn-excluir">Excluir</button>' : ''}
        </div>
      `;

      const card = info.closest("div");
      card.setAttribute("draggable", true);
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("appt-payload", JSON.stringify({ id: appt.id, appt }));
      });

      info.querySelector(".btn-editar").addEventListener("click", (evt) => {
        evt.stopPropagation();
        abrirModalEdicao(appt);
      });

      const birthdayOpen = info.querySelector('[data-action="open-birthday-modal"]');
      if (birthdayOpen && birthdayItem) {
        birthdayOpen.addEventListener('click', (evt) => {
          evt.stopPropagation();
          openBirthdayModal(birthdayItem);
        });
      }

      const btnExcluir = info.querySelector(".btn-excluir");
      if (btnExcluir) btnExcluir.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        if (confirm("Excluir agendamento?")) {
          try {
            await agendaApi.remove(appt);
            carregarDia();
          } catch (err) {
            console.warn('[AGENDA] erro ao excluir', err);
            showToast(getDeleteErrorMessage(err), 'error');
          }
        }
      });
    } else {
      info.innerHTML = `
        <div><strong>Horário livre</strong></div>
        <div class="slot-meta">Clique para agendar</div>
      `;
      row.addEventListener("click", () => novoAgendamento(slot));
    }

    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      const payloadStr = e.dataTransfer.getData("appt-payload");
      if (!payloadStr) return;
      const payload = JSON.parse(payloadStr);
      const base = payload.appt || apptById.get(payload.id);
      if (!base) return;
      await agendaApi.update(payload.id, {
        ...base,
        data: currentDateIso,
        horaInicio: slot.inicio,
        horaFim: obterFim(slot.inicio),
      });
      carregarDia();
    });

    row.appendChild(time);
    row.appendChild(info);
    lista.appendChild(row);
  });
}

async function novoAgendamento(slot) {
  const paciente = prompt("Nome do paciente:");
  if (!paciente) return;

  const tipo = prompt("Tipo da consulta:", "Consulta") || "Consulta";

  const appt = {
    data: currentDateIso,
    horaInicio: slot.inicio,
    horaFim: slot.fim,
    paciente,
    tipo,
    status: "em_aberto",
  };

  await agendaApi.add(appt);
  carregarDia();
}

document.body.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-action="birthday-send"]');
  if (!btn) return;
  const patientId = String(btn.getAttribute('data-patient-id') || '').trim();
  if (!patientId || !birthdaysApi.sendBirthdayMessage) return;
  try {
    await birthdaysApi.sendBirthdayMessage({
      patientId,
      date: currentDateIso,
      trigger: 'manual',
      force: false,
    });
    showToast('Mensagem de aniversario enviada com sucesso.');
    await loadBirthdaysForDate();
    await carregarDia();
    closeBirthdayModal();
  } catch (err) {
    showToast(err?.message || 'Nao foi possivel enviar a mensagem de aniversario.');
  }
});

birthdayModalCancel?.addEventListener('click', closeBirthdayModal);
birthdayModalSend?.addEventListener('click', async () => {
  if (!birthdayModalItem?.patientId || !birthdaysApi.sendBirthdayMessage) return;
  try {
    await birthdaysApi.sendBirthdayMessage({
      patientId: birthdayModalItem.patientId,
      date: currentDateIso,
      trigger: 'manual',
      force: false,
    });
    showToast('Mensagem de aniversario enviada com sucesso.');
    closeBirthdayModal();
    await loadBirthdaysForDate();
    await carregarDia();
  } catch (err) {
    showToast(err?.message || 'Nao foi possivel enviar a mensagem de aniversario.');
  }
});

// Inicialização
if (!currentDateIso) {
  definirData(normalizeDateLocal(new Date()));
}

