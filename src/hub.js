import { initVersionLabel } from './version.js';
import { fetchPatchNotes } from './patchnotes.js';
import {
  loginUser as apiLoginUser,
  createUser as apiCreateUser,
  logoutUser as apiLogoutUser,
  fetchLeaderboard as apiFetchLeaderboard
} from './auth.js';

let currentUser = null;       // { username } | null
let loginContext = null;      // 'download' | 'menu' | 'leaderboard' | null
let patchNotesData = null;    // { meta, versions } | null
let leaderboardLoaded = false;

function getElement(id){
  if(typeof document === 'undefined') return null;
  return document.getElementById(id);
}

function readAuthPreference(){
  if(typeof window === 'undefined' || !window.localStorage) return null;
  try{
    const raw = window.localStorage.getItem('nano_siege_auth_v1');
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== 'object') return null;
    const name = (parsed.username || '').trim();
    if(!name) return null;
    return { username: name, stay: !!parsed.stay };
  }catch(e){
    return null;
  }
}

function writeAuthPreference(username, stay){
  if(typeof window === 'undefined' || !window.localStorage) return;
  try{
    const name = (username || '').trim();
    if(!name || !stay){
      window.localStorage.removeItem('nano_siege_auth_v1');
      return;
    }
    const payload = { username: name, stay: true };
    window.localStorage.setItem('nano_siege_auth_v1', JSON.stringify(payload));
  }catch(e){
    // best-effort only
  }
}

function clearAuthPreference(){
  if(typeof window === 'undefined' || !window.localStorage) return;
  try{
    window.localStorage.removeItem('nano_siege_auth_v1');
  }catch(e){
    // ignore
  }
}

function updateSignedInBanner(username){
  const banner = getElement('signin-banner');
  const nameEl = getElement('signin-username');
  if(!banner || !nameEl) return;
  if(username){
    nameEl.textContent = username;
  }else{
    nameEl.textContent = 'Guest';
  }
}

function updateMainSignInButton(){
  const button = getElement('btn-main-loaduser');
  if(!button) return;
  button.textContent = currentUser ? 'Sign Out' : 'Sign In';
}

function setSignedInUser(username){
  if(username){
    currentUser = { username };
  }else{
    currentUser = null;
  }
  updateSignedInBanner(username || '');
  updateMainSignInButton();
}

function hydrateAuthFromStorage(){
  const pref = readAuthPreference();
  if(pref && pref.username){
    setSignedInUser(pref.username);
  }else{
    setSignedInUser(null);
  }
}

function showOverlay(element, visible){
  if(!element) return;
  if(visible){
    element.classList.add('visible');
  }else{
    element.classList.remove('visible');
  }
}

function openLoginOverlay(context){
  loginContext = context || null;
  const mainMenu = getElement('mainmenu-overlay');
  const loadMenu = getElement('loadmenu-overlay');
  const createOverlay = getElement('create-overlay');
  const statusEl = getElement('login-status');
  const usernameInput = getElement('login-username');
  const passwordInput = getElement('login-password');
  const heading = loadMenu ? loadMenu.querySelector('h2') : null;
  const tagLine = loadMenu ? loadMenu.querySelector('.tag') : null;

  if(mainMenu){
    mainMenu.classList.remove('visible');
  }
  if(createOverlay){
    createOverlay.classList.remove('visible');
  }
  if(loadMenu){
    loadMenu.classList.add('visible');
  }
  if(statusEl){
    statusEl.textContent = '';
  }
  if(usernameInput && !usernameInput.value && currentUser && currentUser.username){
    usernameInput.value = currentUser.username;
  }
  if(passwordInput){
    passwordInput.value = '';
  }
  if(heading){
    heading.textContent = 'Sign In';
  }
  if(tagLine){
    tagLine.textContent = 'Log in with your Nano‑Siege profile to continue.';
  }
}

function closeLoginOverlay(){
  const loadMenu = getElement('loadmenu-overlay');
  const mainMenu = getElement('mainmenu-overlay');
  if(loadMenu){
    loadMenu.classList.remove('visible');
  }
  if(mainMenu){
    mainMenu.classList.add('visible');
  }
  loginContext = null;
}

function openCreateOverlay(){
  const loadMenu = getElement('loadmenu-overlay');
  const createOverlay = getElement('create-overlay');
  const statusEl = getElement('create-status');
  const usernameInput = getElement('create-username');
  const passwordInput = getElement('create-password');
  const confirmInput = getElement('create-confirm');

  if(loadMenu){
    loadMenu.classList.remove('visible');
  }
  if(createOverlay){
    createOverlay.classList.add('visible');
  }
  if(statusEl){
    statusEl.textContent = '';
  }
  if(usernameInput && !usernameInput.value){
    usernameInput.value = '';
  }
  if(passwordInput){
    passwordInput.value = '';
  }
  if(confirmInput){
    confirmInput.value = '';
  }
}

function closeCreateOverlay(){
  const createOverlay = getElement('create-overlay');
  const mainMenu = getElement('mainmenu-overlay');
  const loadMenu = getElement('loadmenu-overlay');
  if(createOverlay){
    createOverlay.classList.remove('visible');
  }
  if(loadMenu){
    loadMenu.classList.remove('visible');
  }
  if(mainMenu){
    mainMenu.classList.add('visible');
  }
}

function startLauncherDownload(){
  try{
    const hostedUrl = (typeof window !== 'undefined' && window.NANO_DOWNLOAD_URL)
      ? window.NANO_DOWNLOAD_URL
      : 'downloads/NanoSiegeLauncher-linux.AppImage';
    const anchor = document.createElement('a');
    anchor.href = hostedUrl;
    anchor.download = '';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }catch(e){
    // best-effort; if this fails the user can still use the
    // direct link on the website.
  }
}

async function handleLoginSubmit(){
  const usernameInput = getElement('login-username');
  const passwordInput = getElement('login-password');
  const stayCheckbox = getElement('login-stay-signedin');
  const statusEl = getElement('login-status');
  if(!usernameInput || !passwordInput || !statusEl){
    return;
  }
  const username = (usernameInput.value || '').trim();
  const password = passwordInput.value || '';
  const staySignedIn = !!(stayCheckbox && stayCheckbox.checked);

  if(!username || !password){
    statusEl.textContent = 'Username and password required.';
    statusEl.classList.remove('ok');
    statusEl.style.color = '#ff5370';
    return;
  }

  statusEl.textContent = 'Contacting server…';
  statusEl.style.color = '#17e7a4';
  try{
    const result = await apiLoginUser(username, password);
    const resolvedName = (result && typeof result.username === 'string' && result.username.trim())
      ? result.username.trim()
      : username;
    setSignedInUser(resolvedName);
    if(staySignedIn){
      writeAuthPreference(resolvedName, true);
    }else{
      clearAuthPreference();
    }
    statusEl.textContent = result && result.created
      ? 'User created and loaded.'
      : 'Login successful.';
    statusEl.style.color = '#17e7a4';
    const context = loginContext;
    closeLoginOverlay();
    if(context === 'download'){
      startLauncherDownload();
    } else if(context === 'leaderboard'){
      openLeaderboardOverlay();
    }
  }catch(err){
    statusEl.textContent = err && err.message ? err.message : 'Login failed.';
    statusEl.style.color = '#ff5370';
  }
}

async function handleCreateUserSubmit(){
  const usernameInput = getElement('create-username');
  const passwordInput = getElement('create-password');
  const confirmInput = getElement('create-confirm');
  const statusEl = getElement('create-status');
  if(!usernameInput || !passwordInput || !confirmInput || !statusEl){
    return;
  }
  const username = (usernameInput.value || '').trim();
  const password = passwordInput.value || '';
  const confirm = confirmInput.value || '';

  if(!username || !password){
    statusEl.textContent = 'Username and password required.';
    statusEl.style.color = '#ff5370';
    return;
  }
  if(password !== confirm){
    statusEl.textContent = 'Passwords do not match.';
    statusEl.style.color = '#ff5370';
    return;
  }

  statusEl.textContent = 'Creating user…';
  statusEl.style.color = '#17e7a4';
  try{
    const result = await apiCreateUser(username, password);
    const resolvedName = (result && typeof result.username === 'string' && result.username.trim())
      ? result.username.trim()
      : username;
    setSignedInUser(resolvedName);
    // New accounts default to staying signed in on this browser.
    writeAuthPreference(resolvedName, true);
    statusEl.textContent = 'User created and signed in.';
    statusEl.style.color = '#17e7a4';
    const context = loginContext;
    closeCreateOverlay();
    if(context === 'download'){
      startLauncherDownload();
    } else if(context === 'leaderboard'){
      openLeaderboardOverlay();
    }
  }catch(err){
    statusEl.textContent = err && err.message ? err.message : 'Failed to create user.';
    statusEl.style.color = '#ff5370';
  }
}

async function loadPatchNotesOnce(){
  const selectEl = getElement('patch-version-select');
  const summaryEl = getElement('patch-version-summary');
  const listEl = getElement('patchnotes-list');
  if(!selectEl || !summaryEl || !listEl){
    return;
  }
  if(patchNotesData && Array.isArray(patchNotesData.versions) && patchNotesData.versions.length && selectEl.options.length){
    return;
  }

  summaryEl.textContent = 'Loading patch notes…';
  listEl.innerHTML = '';
  const data = await fetchPatchNotes();
  if(!data || !Array.isArray(data.versions) || !data.versions.length){
    summaryEl.textContent = 'Patch notes are not available right now.';
    return;
  }

  patchNotesData = data;
  selectEl.innerHTML = '';
  data.versions.forEach((entry, index) => {
    const option = document.createElement('option');
    option.value = entry.version || String(index + 1);
    option.textContent = entry.version || `Build ${index + 1}`;
    selectEl.appendChild(option);
  });

  const first = data.versions[0];
  const initialValue = first.version || (selectEl.options[0] && selectEl.options[0].value) || '';
  if(initialValue){
    selectEl.value = initialValue;
  }
  renderPatchNotesForVersion(initialValue);

  selectEl.addEventListener('change', () => {
    renderPatchNotesForVersion(selectEl.value);
  });
}

function renderPatchNotesForVersion(versionKey){
  if(!patchNotesData || !Array.isArray(patchNotesData.versions) || !patchNotesData.versions.length){
    return;
  }
  const summaryEl = getElement('patch-version-summary');
  const listEl = getElement('patchnotes-list');
  if(!summaryEl || !listEl){
    return;
  }
  const entry = patchNotesData.versions.find((v) => v.version === versionKey) || patchNotesData.versions[0];
  if(!entry){
    return;
  }

  const channel = patchNotesData.meta && patchNotesData.meta.channel
    ? String(patchNotesData.meta.channel).toUpperCase()
    : '';
  const labelParts = [];
  if(channel){
    labelParts.push(channel);
  }
  if(entry.version){
    labelParts.push(entry.version);
  }
  summaryEl.textContent = labelParts.join(' ') || 'Patch Notes';

  listEl.innerHTML = '';
  const notes = Array.isArray(entry.notes) ? entry.notes : [];
  for(const line of notes){
    const item = document.createElement('li');
    item.textContent = String(line);
    listEl.appendChild(item);
  }
}

async function refreshHubLeaderboard(){
  const listEl = getElement('leaderboard-list');
  const statusEl = getElement('leaderboard-status');
  const warningEl = getElement('leaderboard-warning');
  const devWarningEl = getElement('leaderboard-dev-warning');
  if(devWarningEl){
    devWarningEl.style.display = 'none';
  }
  if(!listEl || !statusEl){
    return;
  }
  statusEl.textContent = 'Loading...';
  statusEl.style.color = '#17e7a4';
  listEl.innerHTML = '';
  try{
    const res = await apiFetchLeaderboard(null);
    const entries = res && Array.isArray(res.entries) ? res.entries : [];
    if(!entries.length){
      statusEl.textContent = 'No entries yet.';
      statusEl.style.color = '#9fb7ff';
      leaderboardLoaded = true;
      return;
    }
    statusEl.textContent = '';
    statusEl.style.color = '#17e7a4';
    entries.forEach((entry, index) => {
      const li = document.createElement('li');
      const rank = index + 1;
      const user = (entry.username || 'Unknown');
      const waves = Number.isFinite(entry.waves) ? entry.waves : 0;
      const perfect = Number.isFinite(entry.perfectCombo) ? entry.perfectCombo : 0;
      li.textContent = `#${rank} — ${user} — Waves: ${waves} — Perfect Combo: ${perfect}`;
      listEl.appendChild(li);
    });
    if(warningEl){
      if(currentUser && currentUser.username){
        warningEl.textContent = 'Welcome ';
        const span = document.createElement('span');
        span.className = 'lb-username';
        span.textContent = currentUser.username;
        warningEl.innerHTML = '';
        warningEl.appendChild(document.createTextNode('Welcome '));
        warningEl.appendChild(span);
      }else{
        warningEl.textContent = 'Leaderboard scores are recorded from signed-in runs.';
      }
    }
    leaderboardLoaded = true;
  }catch(err){
    statusEl.textContent = (err && err.message) ? err.message : 'Failed to load leaderboard.';
    statusEl.style.color = '#ff5370';
  }
}

function openLeaderboardOverlay(){
  const overlay = getElement('leaderboard-overlay');
  const mainMenu = getElement('mainmenu-overlay');
  if(!overlay){
    return;
  }
  if(mainMenu){
    mainMenu.classList.remove('visible');
  }
  overlay.classList.add('visible');
  if(!leaderboardLoaded){
    refreshHubLeaderboard();
  }
}

function attachMainMenuHandlers(){
  const mainMenu = getElement('mainmenu-overlay');
  if(mainMenu){
    mainMenu.classList.add('visible');
  }

  const signInButton = getElement('btn-main-loaduser');
  if(signInButton){
    signInButton.addEventListener('click', async () => {
      if(currentUser && currentUser.username){
        try{
          await apiLogoutUser();
        }catch(e){
          // ignore network errors on logout
        }
        clearAuthPreference();
        setSignedInUser(null);
      }else{
        openLoginOverlay('menu');
      }
    });
  }

  const downloadButton = getElement('btn-main-download');
  if(downloadButton){
    downloadButton.textContent = 'Download';
    downloadButton.addEventListener('click', (event) => {
      event.preventDefault();
      if(!currentUser || !currentUser.username){
        openLoginOverlay('download');
        return;
      }
      startLauncherDownload();
    });
  }

  const leaderboardButton = getElement('btn-main-leaderboard');
  if(leaderboardButton){
    leaderboardButton.addEventListener('click', (event) => {
      event.preventDefault();
      if(!currentUser || !currentUser.username){
        openLoginOverlay('leaderboard');
        return;
      }
      openLeaderboardOverlay();
    });
  }
}

function attachLoginHandlers(){
  const loginSubmit = getElement('btn-login-submit');
  const loginCreate = getElement('btn-login-create');
  const loginBack = getElement('btn-load-back');
  const createSubmit = getElement('btn-create-submit');
  const createBack = getElement('btn-create-back');

  if(loginSubmit){
    loginSubmit.addEventListener('click', (event) => {
      event.preventDefault();
      handleLoginSubmit();
    });
  }
  if(loginCreate){
    loginCreate.addEventListener('click', (event) => {
      event.preventDefault();
      openCreateOverlay();
    });
  }
  if(loginBack){
    loginBack.addEventListener('click', (event) => {
      event.preventDefault();
      closeLoginOverlay();
    });
  }
  if(createSubmit){
    createSubmit.addEventListener('click', (event) => {
      event.preventDefault();
      handleCreateUserSubmit();
    });
  }
  if(createBack){
    createBack.addEventListener('click', (event) => {
      event.preventDefault();
      closeCreateOverlay();
    });
  }
}

function attachDatabaseHandlers(){
  const databaseOverlay = getElement('database-overlay');
  const howToOverlay = getElement('howto-overlay');
  const patchNotesOverlay = getElement('patchnotes-overlay');

  const databaseButton = getElement('btn-main-database');
  if(databaseButton && databaseOverlay){
    databaseButton.addEventListener('click', () => {
      const mainMenu = getElement('mainmenu-overlay');
      if(mainMenu){
        mainMenu.classList.remove('visible');
      }
      databaseOverlay.classList.add('visible');
    });
  }

  const dbHowTo = getElement('btn-db-howto');
  const dbTowers = getElement('btn-db-towers');
  const dbStatus = getElement('btn-db-status');
  const dbCharacters = getElement('btn-db-characters');
  const dbPatch = getElement('btn-db-patchnotes');
  const dbBack = getElement('btn-db-back');
  const howToBack = getElement('btn-howto-back');
  const patchBack = getElement('btn-patch-back');

  const routeToHowTo = (event) => {
    if(event){
      event.preventDefault();
    }
    if(databaseOverlay){
      databaseOverlay.classList.remove('visible');
    }
    if(howToOverlay){
      howToOverlay.classList.add('visible');
    }
  };

  if(dbHowTo){
    dbHowTo.addEventListener('click', routeToHowTo);
  }
  [dbTowers, dbStatus, dbCharacters].forEach((button) => {
    if(!button) return;
    button.addEventListener('click', routeToHowTo);
  });

  if(dbPatch && databaseOverlay && patchNotesOverlay){
    dbPatch.addEventListener('click', async (event) => {
      if(event){
        event.preventDefault();
      }
      databaseOverlay.classList.remove('visible');
      patchNotesOverlay.classList.add('visible');
      await loadPatchNotesOnce();
    });
  }

  if(dbBack && databaseOverlay){
    dbBack.addEventListener('click', (event) => {
      if(event){
        event.preventDefault();
      }
      databaseOverlay.classList.remove('visible');
      const mainMenu = getElement('mainmenu-overlay');
      if(mainMenu){
        mainMenu.classList.add('visible');
      }
    });
  }

  if(howToBack && howToOverlay){
    howToBack.addEventListener('click', (event) => {
      if(event){
        event.preventDefault();
      }
      howToOverlay.classList.remove('visible');
      if(databaseOverlay){
        databaseOverlay.classList.add('visible');
      }else{
        const mainMenu = getElement('mainmenu-overlay');
        if(mainMenu){
          mainMenu.classList.add('visible');
        }
      }
    });
  }

  if(patchBack && patchNotesOverlay){
    patchBack.addEventListener('click', (event) => {
      if(event){
        event.preventDefault();
      }
      patchNotesOverlay.classList.remove('visible');
      if(databaseOverlay){
        databaseOverlay.classList.add('visible');
      }else{
        const mainMenu = getElement('mainmenu-overlay');
        if(mainMenu){
          mainMenu.classList.add('visible');
        }
      }
    });
  }
}

function attachLeaderboardHandlers(){
  const overlay = getElement('leaderboard-overlay');
  if(!overlay){
    return;
  }
  const backButton = getElement('btn-leaderboard-back');
  const signinButton = getElement('btn-leaderboard-signin');
  const searchRow = document.querySelector('.lb-search-row');
  if(searchRow){
    searchRow.style.display = 'none';
  }
  if(backButton){
    backButton.addEventListener('click', (event) => {
      if(event){
        event.preventDefault();
      }
      overlay.classList.remove('visible');
      const mainMenu = getElement('mainmenu-overlay');
      if(mainMenu){
        mainMenu.classList.add('visible');
      }
    });
  }
  if(signinButton){
    signinButton.addEventListener('click', async (event) => {
      if(event){
        event.preventDefault();
      }
      if(currentUser && currentUser.username){
        try{
          await apiLogoutUser();
        }catch(e){
          // ignore logout errors
        }
        clearAuthPreference();
        setSignedInUser(null);
        overlay.classList.remove('visible');
        const mainMenu = getElement('mainmenu-overlay');
        if(mainMenu){
          mainMenu.classList.add('visible');
        }
      }else{
        overlay.classList.remove('visible');
        openLoginOverlay('leaderboard');
      }
    });
  }
}

export async function initHub(){
  if(typeof document === 'undefined'){
    return;
  }

  // Hide the in-browser game board and bottom HUD for the hosted hub
  // build so we only render the lightweight menu shell.
  const gameContainer = getElement('game-container');
  const hud = document.querySelector('.hud');
  const stage = document.querySelector('.stage-wrap');
  const bottomToolbar = getElement('bottom-toolbar');
  if(gameContainer){
    gameContainer.style.display = 'none';
  }
  if(hud){
    hud.style.display = 'none';
  }
  if(stage){
    stage.style.display = 'none';
  }
  if(bottomToolbar){
    bottomToolbar.style.display = 'none';
  }

  // On the hosted web hub, keep the main menu focused on account
  // actions and meta pages rather than gameplay. Hide Play, Settings,
  // and Profile here while leaving Sign In, Database, Leaderboard,
  // and Download visible.
  ['btn-main-play', 'btn-main-settings', 'btn-main-profile'].forEach((id) => {
    const el = getElement(id);
    if(el){
      el.style.display = 'none';
    }
  });

  attachMainMenuHandlers();
  attachLoginHandlers();
  attachDatabaseHandlers();
  attachLeaderboardHandlers();
  hydrateAuthFromStorage();

  try{
    await initVersionLabel();
  }catch(e){
    // version label is best-effort on the hub
  }
}
