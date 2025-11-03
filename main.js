/* ==================================================
   AGENDA BARBER - main.js (V2)
   ================================================== */


const SCOPES = "https://www.googleapis.com/auth/calendar";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];

// =========================================================
// VARIÁVEIS GLOBAIS
// =========================================================
let tokenClient;

// Inicializa Google API Client e OAuth
window.onload = async () => {
  await initializeGapiClient(); // Isso já tenta carregar o token do localStorage
  initializeGisClient();

  // CORREÇÃO 2: VERIFICAÇÃO DO ESTADO DE AUTENTICAÇÃO AO CARREGAR A PÁGINA
  // Se estivermos na página de agendamento, atualiza a UI
  // com base no token que 'initializeGapiClient' pode ter carregado.
  if (window.location.pathname.includes("schedule.html")) {
    if (gapi.client.getToken()) {
      updateUiWithAuthState(true);
    } else {
      updateUiWithAuthState(false);
    }
  }
};

// Inicializa o cliente da API do Google
async function initializeGapiClient() {
  await new Promise((resolve) => gapi.load("client", resolve));
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: DISCOVERY_DOCS,
  });

  // Se já houver token salvo, reusa
  const savedToken = localStorage.getItem("google_token");
  if (savedToken) {
    gapi.client.setToken(JSON.parse(savedToken));
    console.log("Token restaurado do localStorage.");
  }
}

// Inicializa o cliente de autenticação Google Identity Services
function initializeGisClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      gapi.client.setToken(tokenResponse);
      localStorage.setItem("google_token", JSON.stringify(tokenResponse));
      console.log("Autorização bem-sucedida e token salvo.");
    },
  });
}

// =========================================================
// PÁGINA: index.html (Seleção de serviço)
// =========================================================
if (window.location.pathname.includes("index.html") || window.location.pathname === "/") {
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".card .btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const servico = e.target.closest(".card").querySelector("h3").innerText;
        localStorage.setItem("servico", servico);
      });
    });
  });
}

// =========================================================
// PÁGINA: schedule.html (Seleção de data e horário)
// =========================================================
if (window.location.pathname.includes("schedule.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    const authorizeButton = document.getElementById("authorize_button");
    const signoutButton = document.getElementById("signout_button");
    const dateInput = document.querySelector("input[type='date']");

    authorizeButton.onclick = handleAuthClick;
    signoutButton.onclick = handleSignoutClick;

    // Escolha de data
    dateInput.addEventListener("change", (e) => {
      localStorage.setItem("data", e.target.value);
      buscarHorariosOcupados(e.target.value);
    });

    // Seleção de horário
    document.querySelectorAll(".time").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!btn.classList.contains("disabled")) {
          localStorage.setItem("hora", btn.innerText);
          document.querySelectorAll(".time").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
        }
      });
    });

    // Botão avançar
    document.getElementById("btn-avancar").addEventListener("click", (event) => {
      event.preventDefault();
      if (localStorage.getItem("data") && localStorage.getItem("hora")) {
        window.location.href = "confirm.html";
      } else {
        alert("Por favor, selecione data e horário antes de continuar.");
      }
    });
  });

  // Clique em "Autorizar com Google"
  function handleAuthClick() {
    // CORREÇÃO 1: O CALLBACK AGORA SALVA O TOKEN
    tokenClient.callback = (tokenResponse) => {
      if (tokenResponse.error !== undefined) throw tokenResponse;

      // Adiciona as duas linhas que faltavam
      gapi.client.setToken(tokenResponse);
      localStorage.setItem("google_token", JSON.stringify(tokenResponse));
      console.log("Autorização (via handleAuthClick) bem-sucedida e token salvo.");
      
      updateUiWithAuthState(true);
    };

    if (gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
      tokenClient.requestAccessToken({ prompt: "" });
    }
  }

  // Clique em "Sair"
  function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
      google.accounts.oauth2.revoke(token.access_token);
      gapi.client.setToken("");
      localStorage.removeItem("google_token");
      updateUiWithAuthState(false);
    }
  }

  // Atualiza interface
  function updateUiWithAuthState(isSignedIn) {
    const dateInput = document.querySelector("input[type='date']");
    const authorizeButton = document.getElementById("authorize_button");
    const signoutButton = document.getElementById("signout_button");
    const status = document.getElementById("status");

    if (isSignedIn) {
      status.innerText = "✅ Agenda conectada!";
      authorizeButton.style.display = "none";
      signoutButton.style.display = "block";
      dateInput.disabled = false;
    } else {
      status.innerText = "❌ Você precisa autorizar o acesso à agenda.";
      authorizeButton.style.display = "block";
      signoutButton.style.display = "none";
      dateInput.disabled = true;
    }
  }

  // Busca horários ocupados
  async function buscarHorariosOcupados(data) {
    document.querySelectorAll(".time").forEach((btn) => btn.classList.remove("disabled", "selected"));
    const inicioDia = new Date(`${data}T00:00:00-03:00`);
    const fimDia = new Date(`${data}T23:59:59-03:00`);
    try {
      const response = await gapi.client.calendar.events.list({
        calendarId: "primary",
        timeMin: inicioDia.toISOString(),
        timeMax: fimDia.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const horariosOcupados = response.result.items.map((e) => e.start.dateTime.slice(11, 16));
      document.querySelectorAll(".time").forEach((btn) => {
        if (horariosOcupados.includes(btn.innerText)) btn.classList.add("disabled");
      });
    } catch (err) {
      console.error("Erro ao buscar eventos:", err);
    }
  }
}

// =========================================================
// PÁGINA: confirm.html (Confirmação e criação do evento)
// =========================================================
if (window.location.pathname.includes("confirm.html")) {
  document.addEventListener("DOMContentLoaded", () => {
    const servico = localStorage.getItem("servico") || "N/A";
    const data = localStorage.getItem("data");
    const hora = localStorage.getItem("hora");
    const dataFormatada = data ? new Date(data + "T00:00:00-03:00").toLocaleDateString("pt-BR") : "Data inválida";

    // Exibe resumo
    document.querySelector(".summary").innerHTML = `
      <p><strong>Serviço:</strong> ${servico}</p>
      <p><strong>Data:</strong> ${dataFormatada}</p>
      <p><strong>Horário:</strong> ${hora || "N/A"}</p>
    `;

    document.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();

      // Recupera token salvo
      const savedToken = localStorage.getItem("google_token");
      if (!savedToken) {
        alert("Você precisa autorizar o acesso ao Google Calendar antes de confirmar.");
        window.location.href = "schedule.html";
        return;
      }
      gapi.client.setToken(JSON.parse(savedToken));

      const nome = document.querySelector("input[type='text']").value;
      const email = document.querySelector("input[type='email']").value;
      const telefone = document.querySelector("input[type='tel']").value;

      if (!nome || !email || !telefone) {
        alert("Preencha todos os campos para confirmar o agendamento.");
        return;
      }

      await criarEventoGoogle(servico, data, hora, nome, email, telefone);
    });
  });
}

// =========================================================
  // FUNÇÕES GLOBAIS
// =========================================================

// Cria o evento no Google Calendar
async function criarEventoGoogle(servico, data, hora, nome, email, telefone) {
  // Define durações diferentes por serviço
  let duracaoServico = 30; // Duração padrão
  const servicoLower = servico.toLowerCase();
 if (servicoLower.includes('corte de cabelo')) {
    duracaoServico = 60; // 1h
  } else if (servicoLower.includes('corte + barba')) {
    duracaoServico = 60; // 1h
  } else if (servicoLower.includes('pezinho')) {
    duracaoServico = 10;
  } else if (servicoLower.includes('corte navalhado')) {
    duracaoServico = 60; // 1h
  } else if (servicoLower.includes('sobrancelha')) {
    duracaoServico = 10;
  } else if (servicoLower.includes('luzes')) {
    duracaoServico = 120; // 2h
  } else if (servicoLower.includes('alisante')) {
    duracaoServico = 30;
  }

  const horaFim = calcularHoraFinal(data, hora, duracaoServico);

  if (!horaFim) {
      alert("Erro ao calcular o horário final do agendamento.");
      return;
  }

  const evento = {
    summary: `${servico} - ${nome}`,
    description: `Cliente: ${nome}\nEmail: ${email}\nTelefone: ${telefone}`,
    start: { dateTime: `${data}T${hora}:00-03:00`, timeZone: "America/Sao_Paulo" },
    end: { dateTime: horaFim, timeZone: "America/Sao_Paulo" },
    attendees: [{ email: email }],
    reminders: {
      useDefault: false,
      overrides: [{ method: "email", minutes: 24 * 60 }, {method: "popup", minutes: 60}],
    },
  };

  try {
    const request = gapi.client.calendar.events.insert({
      calendarId: "primary",
      resource: evento,
      sendUpdates: "all",
    });

    request.execute(response => {
        console.log("Evento criado:", response);
        if (response.error) {
            console.error("Erro detalhado da API:", response.error);
            alert(`❌ Falha ao criar agendamento. Detalhes: ${response.error.message}`);
        } else {
            alert("✅ Agendamento confirmado com sucesso!");
            localStorage.clear();
            window.location.href = "index.html";
        }
    });

  } catch (err) {
    console.error("Erro ao criar evento:", err);
    alert("❌ Falha ao criar agendamento.");
  }
}

// Calcula o horário final com base na duração
// =================== FUNÇÃO CORRIGIDA ===================
function calcularHoraFinal(data, hora, duracaoMin) {
  if (!data || !hora) return null;

  // 1. Criar o objeto Date com o fuso horário correto
  const inicio = new Date(`${data}T${hora}:00-03:00`);
  
  // 2. Adicionar os minutos
  inicio.setMinutes(inicio.getMinutes() + duracaoMin);

  // 3. Extrair as partes da data (LOCAL)
  //    Precisamos formatar com '0' à esquerda (padding)
  const pad = (num) => String(num).padStart(2, '0');

  const ano = inicio.getFullYear();
  const mes = pad(inicio.getMonth() + 1); // getMonth() é 0-11
  const dia = pad(inicio.getDate());
  const horaFinal = pad(inicio.getHours());
  const minutoFinal = pad(inicio.getMinutes());

  // 4. Montar a string no formato ISO com o offset manual
  //    Ex: "2025-09-25T10:10:00-03:00"
  return `${ano}-${mes}-${dia}T${horaFinal}:${minutoFinal}:00-03:00`;
}