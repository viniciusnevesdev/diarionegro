(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#accountDialog");
  const accountButton = $("#accountButton");
  const mainPage = $("#settingsMainPage");
  const phrasesPage = $("#copilotPhrasesPage");
  const openPhrasesButton = $("#openCopilotPhrases");
  const phrasesBack = $("#copilotPhrasesBack");
  const list = $("#copilotPhrasesList");
  const addButton = $("#addCopilotPhrase");
  const saveButton = $("#saveCopilotPhrases");
  const restoreButton = $("#restoreCopilotPhrases");
  const status = $("#copilotPhrasesStatus");
  const summary = $("#copilotPhrasesSummary");

  if (!dialog || !list) return;

  let phrases = [];
  let defaults = [];

  const cleanPhrases = (values) => (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const parsePhraseFile = (text) => String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  function setStatus(message = "", kind = "") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function setSummary() {
    const count = cleanPhrases(phrases).length;
    summary.textContent = count === 1 ? "1 frase disponível" : `${count} frases disponíveis`;
  }

  function autoHeight(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(46, textarea.scrollHeight)}px`;
  }

  function settingsIcon(name, className = "") {
    const api = window.DN_SYMBOLS;
    return api?.icon ? api.icon(name, className) : "";
  }

  function render() {
    list.innerHTML = "";

    phrases.forEach((phrase, index) => {
      const item = document.createElement("article");
      item.className = "dn-phrase-item";

      const textarea = document.createElement("textarea");
      textarea.className = "dn-phrase-text";
      textarea.value = phrase;
      textarea.rows = 1;
      textarea.maxLength = 180;
      textarea.setAttribute(
        "aria-label",
        `Frase ${index + 1} do Copiloto`
      );

      textarea.addEventListener("input", () => {
        phrases[index] = textarea.value;
        autoHeight(textarea);
        setSummary();
        setStatus("Alterações ainda não salvas.");
      });

      requestAnimationFrame(() => autoHeight(textarea));

      const tools = document.createElement("div");
      tools.className = "dn-phrase-tools";

      const up = document.createElement("button");
      up.type = "button";
      up.className = "dn-phrase-tool dn-phrase-up";
      up.innerHTML = settingsIcon(
        "chevron.right",
        "dn-phrase-action-icon"
      );
      up.disabled = index === 0;
      up.setAttribute("aria-label", "Mover frase para cima");
      up.addEventListener("click", () => {
        if (index <= 0) return;
        [phrases[index - 1], phrases[index]] =
          [phrases[index], phrases[index - 1]];
        render();
        setStatus("Alterações ainda não salvas.");
      });

      const down = document.createElement("button");
      down.type = "button";
      down.className = "dn-phrase-tool dn-phrase-down";
      down.innerHTML = settingsIcon(
        "chevron.right",
        "dn-phrase-action-icon"
      );
      down.disabled = index === phrases.length - 1;
      down.setAttribute("aria-label", "Mover frase para baixo");
      down.addEventListener("click", () => {
        if (index >= phrases.length - 1) return;
        [phrases[index + 1], phrases[index]] =
          [phrases[index], phrases[index + 1]];
        render();
        setStatus("Alterações ainda não salvas.");
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "dn-phrase-tool dn-phrase-delete";
      remove.innerHTML = settingsIcon(
        "trash.fill",
        "dn-phrase-trash-icon"
      );
      remove.setAttribute(
        "aria-label",
        `Excluir frase ${index + 1}`
      );
      remove.addEventListener("click", () => {
        phrases.splice(index, 1);
        render();
        setStatus("Alterações ainda não salvas.");
      });

      tools.append(up, down, remove);
      item.append(textarea, tools);
      list.appendChild(item);
    });

    if (!phrases.length) {
      const empty = document.createElement("div");
      empty.className = "dn-settings-intro";
      empty.textContent =
        "Nenhuma frase. Adicione pelo menos uma antes de salvar.";
      list.appendChild(empty);
    }

    setSummary();
    window.DNGlass?.hydrate?.(list);
  }

  async function loadDefaults() {
    try {
      const response = await fetch(`copiloto-frases.txt?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("arquivo padrão não encontrado");
      const parsed = parsePhraseFile(await response.text());
      if (parsed.length) {
        defaults = parsed;
        return parsed;
      }
    } catch (error) {
      console.warn("Ajustes: não foi possível carregar copiloto-frases.txt", error);
    }

    defaults = [
      "Eu tô aqui pra ajudar você.",
      "Vamos escolher uma coisa de cada vez.",
      "Se estiver difícil começar, eu escolho por você."
    ];
    return [...defaults];
  }

  async function readRemotePhrases() {
    const fallback = await loadDefaults();
    const client = window.DN_APP_API?.getClient?.();
    const session = window.DN_APP_API?.getSession?.();

    let custom = cleanPhrases(session?.user?.user_metadata?.dn_copilot_phrases);

    if (!custom.length && client) {
      try {
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        custom = cleanPhrases(data?.user?.user_metadata?.dn_copilot_phrases);
      } catch (error) {
        console.warn("Ajustes: não foi possível atualizar user_metadata.", error);
      }
    }

    phrases = custom.length ? custom : [...fallback];
    render();
    setStatus(custom.length ? "Frases personalizadas carregadas da sua conta." : "Usando a biblioteca padrão.");
  }

  async function saveRemotePhrases() {
    const clean = cleanPhrases(phrases);
    if (!clean.length) {
      setStatus("Adicione pelo menos uma frase antes de salvar.", "error");
      return;
    }

    const client = window.DN_APP_API?.getClient?.();
    const session = window.DN_APP_API?.getSession?.();
    if (!client || !session) {
      setStatus("Sua conta ainda não está disponível. Entre novamente e tente salvar.", "error");
      return;
    }

    saveButton.disabled = true;
    setStatus("Salvando…");

    try {
      const { data, error } = await client.auth.updateUser({
        data: { dn_copilot_phrases: clean }
      });
      if (error) throw error;

      phrases = clean;
      render();

      window.dispatchEvent(new CustomEvent("dn:copilot-phrases-updated", {
        detail: { phrases: [...phrases], user: data?.user || null }
      }));

      setStatus("Frases salvas e aplicadas ao Copiloto.", "success");
    } catch (error) {
      console.error(error);
      setStatus(`Não foi possível salvar: ${error?.message || "erro desconhecido"}`, "error");
    } finally {
      saveButton.disabled = false;
    }
  }

  function showMainPage() {
    phrasesPage.hidden = true;
    mainPage.hidden = false;
    document.documentElement.classList.remove(
      "dn-settings-subpage"
    );
  }

  async function showPhrasesPage() {
    mainPage.hidden = true;
    phrasesPage.hidden = false;

    document.documentElement.classList.add(
      "dn-settings-subpage"
    );

    setStatus("Carregando frases…");
    await readRemotePhrases();
  }

  openPhrasesButton?.addEventListener("click", showPhrasesPage);
  phrasesBack?.addEventListener("click", showMainPage);

  addButton?.addEventListener("click", () => {
    phrases.push("");
    render();
    requestAnimationFrame(() => {
      const items = list.querySelectorAll(".dn-phrase-text");
      const last = items[items.length - 1];
      last?.focus();
      last?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setStatus("Nova frase adicionada. Escreva e salve.");
  });

  saveButton?.addEventListener("click", saveRemotePhrases);

  restoreButton?.addEventListener("click", async () => {
    if (!defaults.length) await loadDefaults();
    const ok = window.confirm(
      "Restaurar a lista padrão de frases? Você ainda precisará tocar em Salvar alterações."
    );
    if (!ok) return;
    phrases = [...defaults];
    render();
    setStatus("Frases padrão restauradas. Toque em Salvar alterações.");
  });

  dialog.addEventListener("close", () => {
    showMainPage();
    accountButton?.classList.remove("active");
    document.documentElement.classList.remove("dn-settings-open");
  });

  dialog.addEventListener("cancel", showMainPage);

  accountButton?.addEventListener("click", () => {
    requestAnimationFrame(() => {
      if (dialog.open) {
        accountButton.classList.add("active");
        document.documentElement.classList.add("dn-settings-open");
      }
    });
  });

  /* DN_SETTINGS_DOCK_NAV_V1 */
  const mainDock = document.querySelector(".bottom-dock");

  mainDock?.addEventListener("click", (event) => {
    if (!dialog.open) return;

    const button = event.target.closest("button");
    if (!button) return;

    if (button.classList.contains("dock-plus")) return;
    if (button === accountButton) return;

    if (button.classList.contains("dock-item")) {
      dialog.close();
    }
  });

  /* DN_HOME_RECENT_NOTES_SETTING_V1 */
  const recentNotesToggle =
    document.getElementById("showRecentNotesToggle");

  const recentNotesSection =
    document.getElementById("homeRecentNotes");

  const RECENT_NOTES_META_KEY =
    "dn_show_recent_notes";

  function applyRecentNotesPreference(value) {
    const enabled = value !== false;

    if (recentNotesToggle) {
      recentNotesToggle.checked = enabled;
    }

    if (recentNotesSection) {
      recentNotesSection.hidden = !enabled;
    }

    document.documentElement.classList.toggle(
      "dn-hide-recent-notes",
      !enabled
    );
  }

  function readRecentNotesValue(user) {
    const value =
      user?.user_metadata?.[RECENT_NOTES_META_KEY];

    return typeof value === "boolean"
      ? value
      : true;
  }

  async function loadRecentNotesPreference() {
    const client =
      window.DN_APP_API?.getClient?.();

    const session =
      window.DN_APP_API?.getSession?.();

    const sessionValue =
      session?.user?.user_metadata?.[
        RECENT_NOTES_META_KEY
      ];

    if (typeof sessionValue === "boolean") {
      applyRecentNotesPreference(sessionValue);
      return;
    }

    if (!client) {
      applyRecentNotesPreference(true);
      return;
    }

    try {
      const { data, error } =
        await client.auth.getUser();

      if (error) throw error;

      applyRecentNotesPreference(
        readRecentNotesValue(data?.user)
      );
    } catch (error) {
      console.warn(
        "Ajustes: não foi possível carregar preferência de Últimas anotações.",
        error
      );

      applyRecentNotesPreference(true);
    }
  }

  recentNotesToggle?.addEventListener(
    "change",
    async () => {
      const nextValue =
        recentNotesToggle.checked;

      const previousValue =
        !nextValue;

      applyRecentNotesPreference(nextValue);

      const client =
        window.DN_APP_API?.getClient?.();

      if (!client) {
        applyRecentNotesPreference(previousValue);
        return;
      }

      recentNotesToggle.disabled = true;

      try {
        const { error } =
          await client.auth.updateUser({
            data: {
              [RECENT_NOTES_META_KEY]:
                nextValue
            }
          });

        if (error) throw error;

        window.dispatchEvent(
          new CustomEvent(
            "dn:home-preferences-updated",
            {
              detail: {
                showRecentNotes:
                  nextValue
              }
            }
          )
        );
      } catch (error) {
        console.error(error);

        applyRecentNotesPreference(
          previousValue
        );

        alert(
          "Não foi possível salvar essa preferência."
        );
      } finally {
        recentNotesToggle.disabled = false;
      }
    }
  );

  accountButton?.addEventListener(
    "click",
    () => {
      loadRecentNotesPreference();
    }
  );

  loadRecentNotesPreference();

  window.DN_SETTINGS = {
    openPhrases: showPhrasesPage,
    reloadPhrases: readRemotePhrases
  };
})();
