document.addEventListener('DOMContentLoaded', async () => {
    const patientForm = document.getElementById('patient-form');
    const prontuarioField = document.getElementById('prontuario');
    const selectDentista = document.getElementById('selectDentista');
    const dentistaGroup = document.getElementById('dentista-group');
    const allowsMessagesField = document.getElementById('allowsMessages');
    const selfieInput = document.getElementById('selfie-input');
    const selfieSelectBtn = document.getElementById('selfie-select-btn');
    const selfieRemoveBtn = document.getElementById('selfie-remove-btn');
    const selfiePreview = document.getElementById('selfie-preview');
    const selfiePlaceholder = document.getElementById('selfie-placeholder');
    const selfieFileName = document.getElementById('selfie-file-name');
    let currentUser = null;
    let dentistasList = [];
    let selectedSelfieFile = null;
    const appApi = window.appApi || {};
    const authApi = appApi.auth || window.auth || {};
    const patientsApi = appApi.patients || {};

    const acceptedSelfieTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'application/pdf'];
    const acceptedSelfieExt = ['.png', '.jpg', '.jpeg', '.svg', '.pdf'];

    const isAcceptedSelfieFile = (file) => {
        if (!file) return false;
        const type = String(file.type || '').toLowerCase();
        if (acceptedSelfieTypes.includes(type)) return true;
        const lowerName = String(file.name || '').toLowerCase();
        return acceptedSelfieExt.some((ext) => lowerName.endsWith(ext));
    };

    const setSelfieState = (file) => {
        selectedSelfieFile = file || null;
        if (!selfiePreview || !selfiePlaceholder || !selfieFileName) return;

        if (!file) {
            selfiePreview.hidden = true;
            selfiePreview.removeAttribute('src');
            selfiePlaceholder.hidden = false;
            selfiePlaceholder.textContent = '+';
            selfieFileName.textContent = 'Nenhum arquivo selecionado.';
            return;
        }

        selfieFileName.textContent = file.name || 'Arquivo selecionado';

        if (String(file.type || '').toLowerCase() === 'application/pdf') {
            selfiePreview.hidden = true;
            selfiePreview.removeAttribute('src');
            selfiePlaceholder.hidden = false;
            selfiePlaceholder.textContent = 'PDF';
            return;
        }

        selfiePlaceholder.textContent = '+';
        const objectUrl = URL.createObjectURL(file);
        selfiePreview.src = objectUrl;
        selfiePreview.hidden = false;
        selfiePlaceholder.hidden = true;
    };

    function generateProntuario() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

    const loadDentistas = async () => {
        try {
            const users = await (authApi.listUsers ? authApi.listUsers() : []);
            dentistasList = (users || [])
                .filter((u) => {
                    const tipo = String(u?.tipo || '').toLowerCase();
                    const role = String(u?.role || '').toUpperCase();
                    return tipo === 'dentista' || role === 'DENTISTA';
                })
                .map((u) => ({
                    ...u,
                    id: String(u?.id || u?.userId || '').trim(),
                }))
                .filter((u) => !!u.id);
            if (selectDentista) {
                const options = dentistasList.map((d) => {
                    const nome = d.nome || d.fullName || d.login || 'Dentista';
                    const login = d.login ? ` (${d.login})` : '';
                    return `<option value="${d.id}">${nome}${login}</option>`;
                }).join('');
                selectDentista.innerHTML = '<option value="">Selecione...</option>' + options;
                if (!options) {
                    selectDentista.innerHTML = '<option value="">Nenhum dentista cadastrado</option>';
                }
            }
        } catch (err) {
            console.error('Erro ao carregar dentistas:', err);
            if (selectDentista) {
                selectDentista.innerHTML = '<option value="">Falha ao carregar dentistas</option>';
            }
        }
    };

    prontuarioField.value = generateProntuario();

    currentUser = await (authApi.currentUser ? authApi.currentUser() : null);
    if (currentUser?.tipo === 'admin' || currentUser?.tipo === 'recepcionista') {
        if (dentistaGroup) dentistaGroup.style.display = 'block';
        await loadDentistas();
    } else {
        if (dentistaGroup) dentistaGroup.style.display = 'none';
    }

    selfieSelectBtn?.addEventListener('click', () => {
        selfieInput?.click();
    });

    selfieInput?.addEventListener('change', () => {
        const file = selfieInput.files?.[0] || null;
        if (!file) {
            setSelfieState(null);
            return;
        }
        if (!isAcceptedSelfieFile(file)) {
            alert('Formato nao suportado para selfie. Use PNG, JPG, JPEG, SVG ou PDF.');
            selfieInput.value = '';
            setSelfieState(null);
            return;
        }
        setSelfieState(file);
    });

    selfieRemoveBtn?.addEventListener('click', () => {
        if (selfieInput) selfieInput.value = '';
        setSelfieState(null);
    });

    patientForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!patientForm.checkValidity()) {
            patientForm.reportValidity();
            return;
        }

        const formData = new FormData(patientForm);
        const patientData = {};
        for (const [key, value] of formData.entries()) {
            patientData[key] = value;
        }
        patientData.allowsMessages = allowsMessagesField ? !!allowsMessagesField.checked : true;

        try {
            if (currentUser?.tipo === 'admin' || currentUser?.tipo === 'recepcionista') {
                if (!selectDentista || !selectDentista.value) {
                    alert('Selecione o dentista responsavel.');
                    return;
                }
                const dent = dentistasList.find((d) => d.id === selectDentista.value);
                if (!dent) {
                    alert('Dentista invalido.');
                    return;
                }
                const nomeDentista = dent.nome || dent.fullName || dent.login || 'Dentista';
                const ok = confirm(`Confirmar atribuicao do paciente para ${nomeDentista}?`);
                if (!ok) return;
                patientData.dentistaId = dent.id;
                patientData.dentistaNome = nomeDentista;
            }

            const savedProntuario = patientData.prontuario;
            if (!patientsApi.save) {
                throw new Error('Cadastro de paciente indisponivel neste ambiente.');
            }
            await patientsApi.save(patientData);

            if (selectedSelfieFile?.path && patientsApi.uploadSelfie) {
                await patientsApi.uploadSelfie({
                    prontuario: savedProntuario,
                    filePath: selectedSelfieFile.path,
                    fileName: selectedSelfieFile.name || 'selfie',
                    mimeType: selectedSelfieFile.type || '',
                });
            }

            alert('Cadastro feito com sucesso!');
            patientForm.reset();
            prontuarioField.value = generateProntuario();
            if (selectDentista) selectDentista.value = '';
            if (selfieInput) selfieInput.value = '';
            if (selfiePlaceholder) selfiePlaceholder.textContent = '+';
            setSelfieState(null);
        } catch (error) {
            console.error('Erro ao salvar paciente:', error);
            alert(`Ocorreu um erro ao cadastrar o paciente: ${error.message}`);
        }
    });

});
