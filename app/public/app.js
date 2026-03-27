const COLOR_KEYS = [
  'banner_border', 'banner_title', 'banner_accent', 'banner_dim', 'banner_text',
  'ui_accent', 'ui_label', 'ui_ok', 'ui_error', 'ui_warn', 'prompt', 'input_rule',
  'response_border', 'session_label', 'session_border'
];

const colorGrid = document.getElementById('colorGrid');
const skinCardTemplate = document.getElementById('skinCardTemplate');
const userList = document.getElementById('userList');
const userListEmpty = document.getElementById('userListEmpty');
const yamlOutput = document.getElementById('yamlOutput');
const statusMessage = document.getElementById('statusMessage');
const previewSkinName = document.getElementById('previewSkinName');
const previewWorkspace = document.getElementById('previewWorkspace');
const previewEmptyState = document.getElementById('previewEmptyState');
const previewDocumentTitle = document.getElementById('previewDocumentTitle');
const inspectorWorkspace = document.getElementById('inspectorWorkspace');
const inspectorEmptyState = document.getElementById('inspectorEmptyState');
const inspectorToolbar = document.getElementById('inspectorToolbar');
const libraryActiveSkinLabel = document.getElementById('libraryActiveSkinLabel');
const savedSkinCount = document.getElementById('savedSkinCount');
const activeSkinLabel = document.getElementById('activeSkinLabel');
const hermesHomeLabel = document.getElementById('hermesHomeLabel');
const editorModeLabel = document.getElementById('editorModeLabel');
const saveButton = document.getElementById('saveButton');
const activateButton = document.getElementById('activateButton');
const cloneButton = document.getElementById('cloneButton');
const createModal = document.getElementById('createModal');
const createSkinNameInput = document.getElementById('createSkinName');
const createPresetField = document.getElementById('createPresetField');
const createExistingField = document.getElementById('createExistingField');
const createPresetSelect = document.getElementById('createPresetSelect');
const createExistingSelect = document.getElementById('createExistingSelect');
const createModeButtons = Array.from(document.querySelectorAll('[data-create-mode]'));
let logoGenerateTimer = null;
let heroGenerateTimer = null;
let previewArtFrame = 0;
let previewStageFitFrame = 0;
let inspectorScrollFrame = 0;
let viewportSyncFrame = 0;
let viewportRecoveryTimers = [];
let nativeFileDialogOpen = false;
let viewportLockHeight = 0;
let viewportUnlockTimer = 0;
let viewportHeightFloor = 0;
let viewportHeightFloorUntil = 0;
let logoGeneratorLinkedToAgentName = true;
let lastAgentNameValue = '';

const state = {
  activeSkin: 'default',
  activeInspectorSection: 'section-skin',
  currentSource: 'user',
  currentName: '',
  heroGeneratorImageData: '',
  heroGeneratorImageName: '',
  hermesHome: '~/.hermes',
  presetSkins: [],
  logoStyles: [],
  heroStyles: [],
  userSkins: [],
  selectedSkin: blankSkin('custom-skin'),
  hasSelection: false,
  createMode: 'blank',
  createNameDirty: false
};

function blankSkin(name = 'custom-skin') {
  return {
    name,
    description: '',
    colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, key === 'response_border' ? '#60A5FA' : '#8EA3FF'])),
    spinner: {
      waiting_faces: ['◐', '◓', '◑', '◒'],
      thinking_faces: ['◐', '◓', '◑', '◒'],
      thinking_verbs: ['thinking', 'routing', 'drafting'],
      wings: [['‹', '›']]
    },
    branding: {
      agent_name: 'Hermes Agent',
      welcome: 'Ready when you are.',
      goodbye: 'Goodbye.',
      response_label: ' Hermes ',
      prompt_symbol: '› ',
      help_header: 'Commands'
    },
    tool_prefix: '┊',
    tool_emojis: {
      terminal: '',
      web_search: '',
      browser_navigate: '',
      file: '',
      todo: ''
    },
    banner_logo: '',
    banner_hero: '',
    banner_logo_plain: '',
    banner_logo_style: { color: '#c93c24', bold: true, dim: false },
    banner_hero_plain: '',
    banner_hero_style: { color: '#c7a96b', bold: false, dim: false }
  };
}

function setStatus(text, tone = 'normal') {
  statusMessage.textContent = text;
  statusMessage.style.color = tone === 'error' ? '#f5f5f5' : tone === 'ok' ? '#d4d4d4' : '#8a8a8a';
}

function formatTimestamp(value) {
  if (!value) return 'Custom skin';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Custom skin' : `Updated ${date.toLocaleString()}`;
}

function isCurrentSkinSaved() {
  return state.currentSource === 'user' && state.userSkins.some((item) => item.name === state.currentName);
}

function updateEditorLabels() {
  if (!state.hasSelection) {
    previewDocumentTitle.textContent = 'No skin selected';
    editorModeLabel.textContent = 'No draft';
    return;
  }

  const selectedName = state.selectedSkin?.name || 'custom-skin';
  const isSaved = isCurrentSkinSaved();
  previewDocumentTitle.textContent = selectedName;
  editorModeLabel.textContent = isSaved ? 'Saved custom skin' : 'Unsaved draft';
}

function updateWorkspaceState() {
  const hasSelection = state.hasSelection;
  previewWorkspace.hidden = !hasSelection;
  previewEmptyState.hidden = hasSelection;
  inspectorWorkspace.hidden = !hasSelection;
  inspectorEmptyState.hidden = hasSelection;
  inspectorToolbar.hidden = !hasSelection;
  saveButton.disabled = !hasSelection;
  activateButton.disabled = !hasSelection;
  cloneButton.disabled = !hasSelection;
  document.getElementById('deleteButton').disabled = !hasSelection || !isCurrentSkinSaved();
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom-skin';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHexColor(color, fallback = '#c93c24') {
  const value = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function autoGrowTextarea(element) {
  if (!(element instanceof HTMLTextAreaElement)) return;
  const minHeight = Number.parseFloat(window.getComputedStyle(element).minHeight) || 0;
  element.style.height = 'auto';
  element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`;
}

function refreshAutoGrowTextareas() {
  document.querySelectorAll('textarea').forEach(autoGrowTextarea);
}

function makeColorField(key) {
  const label = document.createElement('label');
  label.className = 'field color-field';
  const title = document.createElement('span');
  title.textContent = key;
  const input = document.createElement('input');
  input.type = 'color';
  input.id = `color_${key}`;
  input.value = '#8ea3ff';
  input.addEventListener('input', syncFromForm);
  label.append(title, input);
  return label;
}

function initColorGrid() {
  COLOR_KEYS.forEach((key) => colorGrid.appendChild(makeColorField(key)));
}

function toYaml(skin) {
  const lines = [];
  const q = (value) => JSON.stringify(String(value ?? ''));
  lines.push(`name: ${slugify(skin.name)}`);
  lines.push(`description: ${q(skin.description)}`);
  lines.push('');
  lines.push('colors:');
  COLOR_KEYS.forEach((key) => {
    if (skin.colors[key]) lines.push(`  ${key}: ${q(skin.colors[key])}`);
  });
  lines.push('');
  lines.push('spinner:');
  ['waiting_faces', 'thinking_faces', 'thinking_verbs'].forEach((key) => {
    lines.push(`  ${key}:`);
    (skin.spinner[key] || []).forEach((item) => lines.push(`    - ${q(item)}`));
  });
  lines.push('  wings:');
  (skin.spinner.wings || []).forEach((pair) => {
    lines.push(`    - [${q(pair[0] || '')}, ${q(pair[1] || '')}]`);
  });
  lines.push('');
  lines.push('branding:');
  Object.entries(skin.branding || {}).forEach(([key, value]) => {
    lines.push(`  ${key}: ${q(value)}`);
  });
  lines.push('');
  lines.push(`tool_prefix: ${q(skin.tool_prefix || '┊')}`);
  lines.push('tool_emojis:');
  Object.entries(skin.tool_emojis || {}).forEach(([key, value]) => {
    if (value) lines.push(`  ${key}: ${q(value)}`);
  });
  lines.push(`banner_logo: ${q(skin.banner_logo || '')}`);
  lines.push(`banner_hero: ${q(skin.banner_hero || '')}`);
  return lines.join('\n');
}

function parseRichTag(rawTag) {
  const tag = rawTag.trim();
  if (!tag || tag === '/') return { close: true };
  const tokens = tag.split(/\s+/).filter(Boolean);
  const style = {};
  for (const token of tokens) {
    if (token === 'bold') style.fontWeight = '700';
    else if (token === 'dim') style.opacity = '0.65';
    else if (token.startsWith('#')) style.color = token;
  }
  return { close: false, style };
}

function richToHtml(input) {
  const text = String(input || '');
  const stack = [];
  let i = 0;
  let out = '';

  const currentStyle = () => Object.assign({}, ...stack);
  const openStyled = (content) => {
    const style = currentStyle();
    const styleString = Object.entries(style)
      .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${value}`)
      .join(';');
    return styleString ? `<span style="${styleString}">${content}</span>` : content;
  };

  while (i < text.length) {
    if (text[i] === '[') {
      const end = text.indexOf(']', i);
      if (end !== -1) {
        const parsed = parseRichTag(text.slice(i + 1, end));
        if (parsed.close) stack.pop();
        else stack.push(parsed.style);
        i = end + 1;
        continue;
      }
    }

    const nextBracket = text.indexOf('[', i);
    const chunk = text.slice(i, nextBracket === -1 ? text.length : nextBracket);
    const escaped = escapeHtml(chunk).replace(/\n/g, '<br>');
    out += openStyled(escaped);
    i = nextBracket === -1 ? text.length : nextBracket;
  }

  return out;
}

function stripRichMarkup(input) {
  return String(input || '').replace(/\[[^\]]*\]/g, '');
}

function longestLineLength(input) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .reduce((max, line) => Math.max(max, line.length), 0);
}

function fitPreviewArt(elementId, raw, options = {}) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const plain = stripRichMarkup(raw);
  if (!plain.trim()) {
    element.style.fontSize = '';
    return;
  }

  const longestLine = longestLineLength(plain);
  const parentWidth = element.parentElement?.clientWidth || element.clientWidth || 320;
  const maxFontSize = options.maxFontSize ?? 12;
  const minFontSize = options.minFontSize ?? 8;
  const charWidthFactor = options.charWidthFactor ?? 0.62;

  if (!longestLine || !parentWidth) {
    element.style.fontSize = `${maxFontSize}px`;
    return;
  }

  const fittedFontSize = parentWidth / (longestLine * charWidthFactor);
  const fontSize = Math.max(minFontSize, Math.min(maxFontSize, fittedFontSize));
  element.style.fontSize = `${fontSize.toFixed(2)}px`;
}

function getViewportHeight() {
  const candidates = [
    window.innerHeight,
    document.documentElement?.clientHeight,
    document.body?.clientHeight,
    window.visualViewport?.height
  ];

  let height = 0;
  for (const candidate of candidates) {
    const nextHeight = Number(candidate);
    if (Number.isFinite(nextHeight) && nextHeight > 0) {
      height = Math.max(height, Math.round(nextHeight));
    }
  }

  return height;
}

function resolveViewportLockHeight() {
  const currentHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--app-height'), 10);
  const shellHeight = document.querySelector('.shell')?.getBoundingClientRect().height || 0;
  const layoutHeight = document.querySelector('.layout')?.getBoundingClientRect().height || 0;
  return Math.max(
    Number.isFinite(currentHeight) ? currentHeight : 0,
    Math.round(shellHeight),
    Math.round(layoutHeight),
    getViewportHeight()
  );
}

function getHeightFloor() {
  if (viewportLockHeight) return viewportLockHeight;
  if (!viewportHeightFloor) return 0;
  if (nativeFileDialogOpen) return viewportHeightFloor;
  if (Date.now() <= viewportHeightFloorUntil) return viewportHeightFloor;
  viewportHeightFloor = 0;
  viewportHeightFloorUntil = 0;
  return 0;
}

function applyViewportHeight(height) {
  const measuredHeight = Number(height);
  const floor = getHeightFloor();
  const nextHeight = Math.max(
    floor,
    Number.isFinite(measuredHeight) && measuredHeight > 0 ? Math.round(measuredHeight) : 0
  );
  if (!nextHeight) return 0;
  document.documentElement.style.setProperty('--app-height', `${nextHeight}px`);
  return nextHeight;
}

function setViewportLockStyles(height) {
  const targets = [
    document.documentElement,
    document.body,
    document.querySelector('.shell'),
    document.querySelector('.layout')
  ];
  targets.forEach((target) => {
    if (!target) return;
    target.style.height = `${height}px`;
    target.style.minHeight = `${height}px`;
    target.style.maxHeight = `${height}px`;
  });
}

function clearViewportLockStyles() {
  const targets = [
    document.documentElement,
    document.body,
    document.querySelector('.shell'),
    document.querySelector('.layout')
  ];
  targets.forEach((target) => {
    if (!target) return;
    target.style.removeProperty('height');
    target.style.removeProperty('min-height');
    target.style.removeProperty('max-height');
  });
}

function recoverViewportLayout() {
  applyViewportHeight(getViewportHeight());

  if (!state.hasSelection) return;
  const frame = document.getElementById('startupScaleFrame');
  const screen = document.getElementById('startupScreenPreview');
  if (frame instanceof HTMLElement) {
    frame.style.width = '';
    frame.style.height = '';
  }
  if (screen instanceof HTMLElement) {
    screen.style.width = 'max-content';
    screen.style.transform = 'none';
  }
  fitPreviewArt('startupLogoPreview', state.selectedSkin.banner_logo || '', { maxFontSize: 13, minFontSize: 8 });
  fitPreviewArt('bannerHeroPreview', state.selectedSkin.banner_hero || '', { maxFontSize: 12, minFontSize: 8 });
  fitStartupPreviewStage();
}

function scheduleViewportSync() {
  if (nativeFileDialogOpen) return;
  if (viewportSyncFrame) return;
  viewportSyncFrame = window.requestAnimationFrame(() => {
    viewportSyncFrame = 0;
    if (nativeFileDialogOpen) return;
    recoverViewportLayout();
  });
}

function clearViewportRecoveryTimers() {
  viewportRecoveryTimers.forEach((timer) => window.clearTimeout(timer));
  viewportRecoveryTimers = [];
}

function beginNativeFileDialog() {
  nativeFileDialogOpen = true;
  if (viewportUnlockTimer) {
    window.clearTimeout(viewportUnlockTimer);
    viewportUnlockTimer = 0;
  }
  viewportLockHeight = resolveViewportLockHeight();
  setViewportLockStyles(viewportLockHeight);
  applyViewportHeight(viewportLockHeight);
  viewportHeightFloor = viewportLockHeight;
  viewportHeightFloorUntil = Date.now() + 2000;
  clearViewportRecoveryTimers();
  if (viewportSyncFrame) {
    window.cancelAnimationFrame(viewportSyncFrame);
    viewportSyncFrame = 0;
  }
}

function endNativeFileDialog(delays = [0, 160, 480, 960]) {
  nativeFileDialogOpen = false;
  if (viewportLockHeight) {
    applyViewportHeight(viewportLockHeight);
  }
  if (viewportHeightFloor) {
    viewportHeightFloorUntil = Date.now() + 2000;
    applyViewportHeight(viewportHeightFloor);
  }
  if (viewportUnlockTimer) {
    window.clearTimeout(viewportUnlockTimer);
  }
  viewportUnlockTimer = window.setTimeout(() => {
    viewportUnlockTimer = 0;
    clearViewportLockStyles();
    viewportLockHeight = 0;
    recoverViewportLayout();
    const followUpDelays = delays
      .filter((delay) => delay > 180)
      .map((delay) => delay - 180);
    if (followUpDelays.length) {
      queueViewportRecovery(followUpDelays);
    }
  }, 180);
}

function queueViewportRecovery(delays = [0, 160, 480, 960]) {
  clearViewportRecoveryTimers();
  delays.forEach((delay) => {
    const timer = window.setTimeout(() => {
      viewportRecoveryTimers = viewportRecoveryTimers.filter((value) => value !== timer);
      scheduleViewportSync();
    }, delay);
    viewportRecoveryTimers.push(timer);
  });
}

function fitStartupPreviewStage() {
  if (nativeFileDialogOpen) return;
  const terminal = document.getElementById('terminalPreview');
  const frame = document.getElementById('startupScaleFrame');
  const screen = document.getElementById('startupScreenPreview');
  if (!(terminal instanceof HTMLElement) || !(frame instanceof HTMLElement) || !(screen instanceof HTMLElement)) return;

  frame.style.width = '';
  frame.style.height = '';
  screen.style.width = 'max-content';
  screen.style.transform = 'none';

  const naturalWidth = Math.ceil(screen.scrollWidth);
  const naturalHeight = Math.ceil(screen.scrollHeight);
  const terminalStyles = window.getComputedStyle(terminal);
  const paddingX = parseFloat(terminalStyles.paddingLeft || '0') + parseFloat(terminalStyles.paddingRight || '0');
  const paddingY = parseFloat(terminalStyles.paddingTop || '0') + parseFloat(terminalStyles.paddingBottom || '0');
  const availableWidth = Math.floor(terminal.clientWidth - paddingX);
  const availableHeight = Math.floor(terminal.clientHeight - paddingY);

  if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) return;

  const scale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
  frame.style.width = `${Math.min(availableWidth, Math.max(1, Math.floor(naturalWidth * scale)))}px`;
  frame.style.height = `${Math.min(availableHeight, Math.max(1, Math.floor(naturalHeight * scale)))}px`;
  screen.style.width = `${naturalWidth}px`;
  screen.style.transform = `scale(${scale})`;
}

function schedulePreviewLayoutFit(logoRaw, heroRaw) {
  if (nativeFileDialogOpen) return;
  window.cancelAnimationFrame(previewArtFrame);
  window.cancelAnimationFrame(previewStageFitFrame);

  previewArtFrame = window.requestAnimationFrame(() => {
    if (nativeFileDialogOpen) {
      previewArtFrame = 0;
      return;
    }
    previewArtFrame = 0;
    const frame = document.getElementById('startupScaleFrame');
    const screen = document.getElementById('startupScreenPreview');
    if (frame instanceof HTMLElement) {
      frame.style.width = '';
      frame.style.height = '';
    }
    if (screen instanceof HTMLElement) {
      screen.style.width = 'max-content';
      screen.style.transform = 'none';
    }
    fitPreviewArt('startupLogoPreview', logoRaw, { maxFontSize: 13, minFontSize: 8 });
    fitPreviewArt('bannerHeroPreview', heroRaw, { maxFontSize: 12, minFontSize: 8 });
    previewStageFitFrame = window.requestAnimationFrame(() => {
      if (nativeFileDialogOpen) {
        previewStageFitFrame = 0;
        return;
      }
      previewStageFitFrame = 0;
      fitStartupPreviewStage();
    });
  });
}

function revealFocusableContext(element) {
  let current = element;
  while (current) {
    if (current instanceof HTMLDetailsElement) current.open = true;
    current = current.parentElement;
  }
}

function scrollInspectorToElement(element) {
  if (!(element instanceof HTMLElement)) return;

  const container = document.querySelector('.inspector-scroll');
  if (!(container instanceof HTMLElement)) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const stickyHeader = document.querySelector('.inspector-topbar');
  const headerHeight = stickyHeader instanceof HTMLElement ? stickyHeader.getBoundingClientRect().height : 0;
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const delta = elementRect.top - containerRect.top;
  const targetTop = container.scrollTop + delta - headerHeight - 12;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior: 'smooth'
  });
}

function resolveInspectorPanel(target) {
  if (!(target instanceof HTMLElement)) return null;
  if (target.matches('[data-inspector-panel]')) return target;
  return target.closest('[data-inspector-panel]');
}

function updateInspectorSectionState() {
  document.querySelectorAll('[data-section-link]').forEach((element) => {
    if (!(element instanceof HTMLButtonElement)) return;
    element.classList.toggle('active', element.dataset.sectionLink === state.activeInspectorSection);
  });

  document.querySelectorAll('[data-inspector-panel]').forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    element.classList.toggle('is-active', element.id === state.activeInspectorSection);
  });
}

function setInspectorSection(sectionId, options = {}) {
  const { scroll = false, scrollTarget = null } = options;
  const target = document.getElementById(sectionId);
  const panel = resolveInspectorPanel(target);
  if (!(panel instanceof HTMLElement)) return;

  state.activeInspectorSection = panel.id;
  updateInspectorSectionState();

  if (scroll) {
    scrollInspectorToElement(scrollTarget instanceof HTMLElement ? scrollTarget : panel);
  }
}

function bindInspectorSectionNav() {
  document.querySelectorAll('[data-section-link]').forEach((element) => {
    if (!(element instanceof HTMLButtonElement)) return;
    element.addEventListener('click', () => {
      const sectionId = element.dataset.sectionLink;
      if (!sectionId) return;
      setInspectorSection(sectionId, { scroll: true });
    });
  });
}

function syncActiveSectionFromScroll() {
  const container = document.querySelector('.inspector-scroll');
  if (!(container instanceof HTMLElement)) return;

  const sections = Array.from(document.querySelectorAll('[data-inspector-panel]'))
    .filter((element) => element instanceof HTMLElement);
  if (!sections.length) return;

  const containerRect = container.getBoundingClientRect();
  const viewportTop = containerRect.top + 18;
  const viewportBottom = containerRect.bottom - 18;
  const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4;

  let activeSection = sections[0];
  let bestVisibleHeight = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  sections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, viewportTop);
    const visibleBottom = Math.min(rect.bottom, viewportBottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const distanceFromTop = Math.abs(rect.top - viewportTop);

    if (
      visibleHeight > bestVisibleHeight ||
      (visibleHeight === bestVisibleHeight && distanceFromTop < bestDistance)
    ) {
      activeSection = section;
      bestVisibleHeight = visibleHeight;
      bestDistance = distanceFromTop;
    }
  });

  if (nearBottom) {
    activeSection = sections[sections.length - 1];
  }

  if (activeSection.id !== state.activeInspectorSection) {
    setInspectorSection(activeSection.id);
  }
}

function scheduleInspectorSectionSync() {
  if (nativeFileDialogOpen) return;
  if (inspectorScrollFrame) return;
  inspectorScrollFrame = window.requestAnimationFrame(() => {
    inspectorScrollFrame = 0;
    if (nativeFileDialogOpen) return;
    syncActiveSectionFromScroll();
  });
}

function bindInspectorScrollTracking() {
  const container = document.querySelector('.inspector-scroll');
  if (!(container instanceof HTMLElement)) return;
  container.addEventListener('scroll', scheduleInspectorSectionSync, { passive: true });
  window.addEventListener('resize', scheduleInspectorSectionSync);
  scheduleInspectorSectionSync();
}

function jumpToTarget({ sectionId, fieldId }) {
  const section = sectionId ? document.getElementById(sectionId) : null;
  const field = fieldId ? document.getElementById(fieldId) : null;
  const scrollTarget = field?.closest('.art-card, .section-block, .field') || section || field;
  if (!(scrollTarget instanceof HTMLElement)) return;

  const panel = resolveInspectorPanel(scrollTarget);
  if (panel instanceof HTMLElement) {
    setInspectorSection(panel.id);
  }

  window.requestAnimationFrame(() => {
    revealFocusableContext(scrollTarget);
    if (field instanceof HTMLElement) revealFocusableContext(field);

    scrollInspectorToElement(scrollTarget);

    if (field instanceof HTMLElement) {
      window.setTimeout(() => {
        field.focus({ preventScroll: true });
        if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.type !== 'color') {
          field.select?.();
        }
      }, 220);
    }
  });
}

function bindPreviewFocusTargets() {
  document.querySelectorAll('[data-section-target], [data-focus-target]').forEach((element) => {
    if (!(element instanceof HTMLElement) || element.dataset.sectionBound === 'true') return;

    const sectionId = element.dataset.sectionTarget;
    const fieldId = element.dataset.focusTarget;
    if (!sectionId && !fieldId) return;

    const activate = () => jumpToTarget({ sectionId, fieldId });
    element.addEventListener('click', activate);
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
    element.dataset.sectionBound = 'true';
  });
}

function inferBlockStyleFromMarkup(input, fallback) {
  const text = String(input || '');
  const match = text.match(/^\[([^\]]+)\]/m);
  if (!match) return { ...fallback };
  const parsed = parseRichTag(match[1]);
  const style = parsed.style || {};
  return {
    color: normalizeHexColor(style.color, fallback.color),
    bold: style.fontWeight === '700' ? true : fallback.bold,
    dim: style.opacity === '0.65' ? true : fallback.dim
  };
}

function buildRichBlock(ascii, style) {
  const plain = String(ascii || '').replace(/\r\n/g, '\n').trimEnd();
  if (!plain.trim()) return '';
  const tags = [];
  if (style.bold) tags.push('bold');
  if (style.dim) tags.push('dim');
  if (style.color) tags.push(normalizeHexColor(style.color, '#c93c24'));
  if (!tags.length) return plain;
  return `[${tags.join(' ')}]${plain}[/]`;
}

function hydrateComposerFields(skin) {
  const fallbackLogoStyle = { color: '#c93c24', bold: true, dim: false };
  const fallbackHeroStyle = { color: '#c7a96b', bold: false, dim: false };

  skin.banner_logo_plain = stripRichMarkup(skin.banner_logo || '');
  skin.banner_hero_plain = stripRichMarkup(skin.banner_hero || '');
  skin.banner_logo_style = inferBlockStyleFromMarkup(skin.banner_logo || '', fallbackLogoStyle);
  skin.banner_hero_style = inferBlockStyleFromMarkup(skin.banner_hero || '', fallbackHeroStyle);
  return skin;
}

function setLogoGeneratorSourceTitle(title, linkedToAgentName = true, options = {}) {
  const { useValue = true } = options;
  const input = document.getElementById('logo_generator_title');
  const normalized = String(title || '').trim();
  input.value = useValue ? normalized : '';
  input.placeholder = normalized || 'Type text to generate a new logo';
  logoGeneratorLinkedToAgentName = linkedToAgentName;
  lastAgentNameValue = document.getElementById('agent_name').value.trim();
}

function applySkinToForm(inputSkin) {
  const skin = hydrateComposerFields(structuredClone(inputSkin));
  state.selectedSkin = skin;
  state.hasSelection = true;
  setHeroGeneratorSource('', '');
  document.getElementById('skinName').value = skin.name || '';
  document.getElementById('description').value = skin.description || '';
  document.getElementById('agent_name').value = skin.branding?.agent_name || '';
  document.getElementById('welcome').value = skin.branding?.welcome || '';
  document.getElementById('goodbye').value = skin.branding?.goodbye || '';
  document.getElementById('response_label').value = skin.branding?.response_label || '';
  document.getElementById('prompt_symbol').value = skin.branding?.prompt_symbol || '';
  document.getElementById('help_header').value = skin.branding?.help_header || '';
  document.getElementById('banner_logo_ascii').value = skin.banner_logo_plain || '';
  document.getElementById('banner_hero_ascii').value = skin.banner_hero_plain || '';
  document.getElementById('banner_logo_color').value = normalizeHexColor(skin.banner_logo_style.color, '#c93c24');
  document.getElementById('banner_hero_color').value = normalizeHexColor(skin.banner_hero_style.color, '#c7a96b');
  document.getElementById('banner_logo_bold').checked = !!skin.banner_logo_style.bold;
  document.getElementById('banner_logo_dim').checked = !!skin.banner_logo_style.dim;
  document.getElementById('banner_hero_bold').checked = !!skin.banner_hero_style.bold;
  document.getElementById('banner_hero_dim').checked = !!skin.banner_hero_style.dim;
  document.getElementById('waiting_faces').value = (skin.spinner?.waiting_faces || []).join(', ');
  document.getElementById('thinking_faces').value = (skin.spinner?.thinking_faces || []).join(', ');
  document.getElementById('thinking_verbs').value = (skin.spinner?.thinking_verbs || []).join(', ');
  document.getElementById('wings').value = ((skin.spinner?.wings || [])[0] || []).join(', ');
  document.getElementById('tool_prefix').value = skin.tool_prefix || '';
  document.getElementById('tool_terminal').value = skin.tool_emojis?.terminal || '';
  document.getElementById('tool_web_search').value = skin.tool_emojis?.web_search || '';
  document.getElementById('tool_browser_navigate').value = skin.tool_emojis?.browser_navigate || '';
  document.getElementById('tool_file').value = skin.tool_emojis?.file || '';
  document.getElementById('tool_todo').value = skin.tool_emojis?.todo || '';
  setLogoGeneratorSourceTitle(skin.branding?.agent_name || skin.name || '', true, { useValue: false });

  COLOR_KEYS.forEach((key) => {
    document.getElementById(`color_${key}`).value = skin.colors?.[key] || '#8ea3ff';
  });

  refreshAutoGrowTextareas();
  updateEditorLabels();
  updateWorkspaceState();
  renderPreview();
}

function syncFromForm() {
  if (!state.hasSelection) return;
  const skin = blankSkin(slugify(document.getElementById('skinName').value || 'custom-skin'));
  skin.description = document.getElementById('description').value.trim();
  skin.branding = {
    agent_name: document.getElementById('agent_name').value,
    welcome: document.getElementById('welcome').value,
    goodbye: document.getElementById('goodbye').value,
    response_label: document.getElementById('response_label').value,
    prompt_symbol: document.getElementById('prompt_symbol').value,
    help_header: document.getElementById('help_header').value
  };

  skin.banner_logo_plain = document.getElementById('banner_logo_ascii').value;
  skin.banner_hero_plain = document.getElementById('banner_hero_ascii').value;
  skin.banner_logo_style = {
    color: normalizeHexColor(document.getElementById('banner_logo_color').value, '#c93c24'),
    bold: document.getElementById('banner_logo_bold').checked,
    dim: document.getElementById('banner_logo_dim').checked
  };
  skin.banner_hero_style = {
    color: normalizeHexColor(document.getElementById('banner_hero_color').value, '#c7a96b'),
    bold: document.getElementById('banner_hero_bold').checked,
    dim: document.getElementById('banner_hero_dim').checked
  };
  skin.banner_logo = buildRichBlock(skin.banner_logo_plain, skin.banner_logo_style);
  skin.banner_hero = buildRichBlock(skin.banner_hero_plain, skin.banner_hero_style);

  skin.spinner = {
    waiting_faces: splitCsv(document.getElementById('waiting_faces').value),
    thinking_faces: splitCsv(document.getElementById('thinking_faces').value),
    thinking_verbs: splitCsv(document.getElementById('thinking_verbs').value),
    wings: [splitCsv(document.getElementById('wings').value).slice(0, 2)]
  };
  skin.tool_prefix = document.getElementById('tool_prefix').value || '┊';
  skin.tool_emojis = {
    terminal: document.getElementById('tool_terminal').value,
    web_search: document.getElementById('tool_web_search').value,
    browser_navigate: document.getElementById('tool_browser_navigate').value,
    file: document.getElementById('tool_file').value,
    todo: document.getElementById('tool_todo').value
  };
  COLOR_KEYS.forEach((key) => {
    skin.colors[key] = document.getElementById(`color_${key}`).value;
  });
  state.selectedSkin = skin;
  updateEditorLabels();
  renderPreview();
}

function renderRichBlock(elementId, raw) {
  const element = document.getElementById(elementId);
  const content = String(raw || '');
  if (!content.trim()) {
    element.innerHTML = '';
    return;
  }
  element.innerHTML = richToHtml(content);
}

function renderPreview() {
  if (!state.hasSelection) {
    yamlOutput.value = '';
    return;
  }
  const skin = state.selectedSkin;
  document.documentElement.style.setProperty('--preview-border-color', skin.colors.banner_border || '#8EA3FF');
  document.documentElement.style.setProperty('--preview-accent-color', skin.colors.banner_accent || '#7DD3FC');
  document.getElementById('startupMetaCard').style.borderColor = skin.colors.banner_border || '#8EA3FF';
  document.getElementById('responsePreview').style.borderColor = skin.colors.response_border || '#60A5FA';
  document.getElementById('previewAgentName').textContent = skin.branding.agent_name || 'Hermes Agent';
  document.getElementById('previewAgentName').style.color = skin.colors.banner_title || '#F5F7FF';
  previewSkinName.textContent = skin.name || 'custom-skin';
  document.getElementById('previewWelcome').textContent = skin.branding.welcome || 'Ready when you are.';
  document.getElementById('previewWelcome').style.color = skin.colors.banner_text || '#D7DCF8';
  document.getElementById('previewResponseLabel').textContent = skin.branding.response_label || ' Hermes ';
  document.getElementById('previewPromptSymbol').textContent = skin.branding.prompt_symbol || '› ';
  document.getElementById('previewToolPrefix').textContent = skin.tool_prefix || '┊';
  document.getElementById('previewSpinnerFace').textContent = skin.spinner.waiting_faces?.[0] || '◐';
  document.getElementById('previewSpinnerVerb').textContent = skin.spinner.thinking_verbs?.[0] || 'thinking';
  document.getElementById('previewWingLeft').textContent = skin.spinner.wings?.[0]?.[0] || '‹';
  document.getElementById('previewWingRight').textContent = skin.spinner.wings?.[0]?.[1] || '›';
  renderRichBlock('startupLogoPreview', skin.banner_logo || '');
  renderRichBlock('bannerHeroPreview', skin.banner_hero || '');
  schedulePreviewLayoutFit(skin.banner_logo || '', skin.banner_hero || '');
  yamlOutput.value = toYaml(skin);
  autoGrowTextarea(yamlOutput);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderCard(target, item, onClick, active = false, metaText = '') {
  const card = skinCardTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector('.skin-card-title').textContent = item.name;
  card.querySelector('.skin-card-desc').textContent = item.description || '';
  card.querySelector('.skin-card-meta').textContent = metaText;
  if (active) card.classList.add('active');
  card.addEventListener('click', onClick);
  target.appendChild(card);
}

function populateLogoStyles(styles) {
  const select = document.getElementById('logo_generator_style');
  select.innerHTML = '';
  styles.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.id} (${item.font})`;
    select.appendChild(option);
  });
  if (!select.value) select.value = 'minimal';
}

function populateHeroStyles(styles) {
  const select = document.getElementById('hero_generator_style');
  select.innerHTML = '';
  styles.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    select.appendChild(option);
  });
  if (!select.value) select.value = 'braille';
}

function renderSkinLists() {
  userList.innerHTML = '';
  userListEmpty.hidden = state.userSkins.length > 0;
  savedSkinCount.textContent = String(state.userSkins.length);

  state.userSkins.forEach((item) => {
    const meta = [];
    if (item.name === state.activeSkin) meta.push('Active');
    meta.push(formatTimestamp(item.modified_at));
    renderCard(userList, item, () => loadSkin(item.name, 'user'), state.currentSource === 'user' && state.currentName === item.name, meta.join(' / '));
  });
}

function populateCreateSourceOptions() {
  createPresetSelect.innerHTML = '';
  state.presetSkins.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.name;
    option.textContent = item.name;
    createPresetSelect.appendChild(option);
  });

  createExistingSelect.innerHTML = '';
  state.userSkins.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.name;
    option.textContent = item.name;
    createExistingSelect.appendChild(option);
  });

  createModeButtons.forEach((button) => {
    const mode = button.dataset.createMode;
    button.disabled = (mode === 'preset' && !state.presetSkins.length) || (mode === 'existing' && !state.userSkins.length);
  });
}

function getAvailableCreateMode(preferred = state.createMode) {
  if (preferred === 'preset' && !state.presetSkins.length) return state.userSkins.length ? 'existing' : 'blank';
  if (preferred === 'existing' && !state.userSkins.length) return state.presetSkins.length ? 'preset' : 'blank';
  return preferred;
}

function suggestCreateName() {
  if (state.createMode === 'preset') {
    return `${createPresetSelect.value || 'preset'}-custom`;
  }
  if (state.createMode === 'existing') {
    return `${createExistingSelect.value || 'custom-skin'}-copy`;
  }
  return 'custom-skin';
}

function syncCreateNameSuggestion(force = false) {
  if (state.createNameDirty && !force) return;
  createSkinNameInput.value = suggestCreateName();
}

function setCreateMode(mode, options = {}) {
  const { forceName = false } = options;
  state.createMode = getAvailableCreateMode(mode);

  createModeButtons.forEach((button) => {
    const isActive = button.dataset.createMode === state.createMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  createPresetField.hidden = state.createMode !== 'preset';
  createExistingField.hidden = state.createMode !== 'existing';
  syncCreateNameSuggestion(forceName);
}

function openCreateModal(preferredMode = 'blank') {
  populateCreateSourceOptions();
  state.createNameDirty = false;
  createModal.hidden = false;
  document.body.classList.add('modal-open');
  setCreateMode(preferredMode, { forceName: true });
  window.requestAnimationFrame(() => createSkinNameInput.focus());
}

function closeCreateModal() {
  createModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function getUniqueSkinName(baseName) {
  const base = slugify(baseName);
  const taken = new Set(state.userSkins.map((item) => item.name));
  if (state.currentName) taken.add(state.currentName);
  if (!taken.has(base)) return base;

  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

async function buildSkinFromCreateModal() {
  const draftName = slugify(createSkinNameInput.value);
  if (!draftName) throw new Error('Enter a skin name');

  if (state.createMode === 'blank') {
    return {
      skin: blankSkin(draftName),
      statusText: `Created blank draft ${draftName}`
    };
  }

  if (state.createMode === 'preset') {
    const presetName = createPresetSelect.value;
    if (!presetName) throw new Error('Choose a starter preset');
    const data = await api(`/api/skins/${encodeURIComponent(presetName)}?source=builtin`);
    const skin = structuredClone(data.skin);
    skin.name = draftName;
    skin.description = skin.description ? `${skin.description} custom copy` : 'Custom skin from preset';
    return {
      skin,
      statusText: `Preset ${presetName} loaded into a new draft`
    };
  }

  const existingName = createExistingSelect.value;
  if (!existingName) throw new Error('Choose an existing skin to clone');
  const data = await api(`/api/skins/${encodeURIComponent(existingName)}?source=user`);
  const skin = structuredClone(data.skin);
  skin.name = draftName;
  skin.description = skin.description ? `${skin.description} copy` : 'Duplicated custom skin';
  return {
    skin,
    statusText: `Cloned ${existingName} into a new draft`
  };
}

async function refreshStatus(reloadCurrent = false) {
  const data = await api('/api/status');
  state.activeSkin = data.active_skin;
  state.presetSkins = data.preset_skins || [];
  state.userSkins = data.user_skins || [];
  state.hermesHome = data.hermes_home;
  libraryActiveSkinLabel.textContent = data.active_skin;
  activeSkinLabel.textContent = data.active_skin;
  hermesHomeLabel.textContent = data.hermes_home;
  renderSkinLists();
  updateEditorLabels();
  updateWorkspaceState();

  if (reloadCurrent && state.currentSource === 'user' && state.userSkins.some((skin) => skin.name === state.currentName)) {
    await loadSkin(state.currentName, 'user', false);
  }
}

async function refreshLogoStyles() {
  const data = await api('/api/logo-styles');
  state.logoStyles = data.styles || [];
  populateLogoStyles(state.logoStyles);
}

async function refreshHeroStyles() {
  const data = await api('/api/hero-styles');
  state.heroStyles = data.styles || [];
  populateHeroStyles(state.heroStyles);
}

async function loadSkin(name, source = 'user', rerenderList = true) {
  if (source !== 'user') throw new Error('Only custom skins are directly editable');
  const data = await api(`/api/skins/${encodeURIComponent(name)}?source=user`);
  state.currentName = data.skin.name;
  state.currentSource = 'user';
  applySkinToForm(data.skin);
  setInspectorSection('section-skin');
  if (rerenderList) renderSkinLists();
  setStatus(`Loaded custom skin ${data.skin.name}`);
}

async function generateLogoFromTitle() {
  const title = document.getElementById('logo_generator_title').value.trim();
  const style = document.getElementById('logo_generator_style').value || 'minimal';
  if (!title) {
    setStatus('Enter a title to generate a logo', 'error');
    return;
  }
  const data = await api('/api/generate-logo', {
    method: 'POST',
    body: JSON.stringify({ title, style })
  });
  document.getElementById('banner_logo_ascii').value = data.ascii || '';
  autoGrowTextarea(document.getElementById('banner_logo_ascii'));
  syncFromForm();
  setStatus(`Generated logo with ${data.font}`, 'ok');
}

function triggerLogoGeneration(delay = 0) {
  window.clearTimeout(logoGenerateTimer);
  const title = document.getElementById('logo_generator_title').value.trim();
  if (!title) return;
  logoGenerateTimer = window.setTimeout(() => {
    generateLogoFromTitle().catch((error) => setStatus(error.message, 'error'));
  }, delay);
}

function handleLogoGeneratorTitleInput(delay = 220) {
  const title = document.getElementById('logo_generator_title').value.trim();
  const agentName = document.getElementById('agent_name').value.trim();
  logoGeneratorLinkedToAgentName = !!title && title === agentName;
  triggerLogoGeneration(delay);
}

function handleAgentNameChange() {
  const agentName = document.getElementById('agent_name').value.trim();
  const logoTitleInput = document.getElementById('logo_generator_title');
  const currentTitle = logoTitleInput.value.trim();

  if (logoGeneratorLinkedToAgentName || !currentTitle || currentTitle === lastAgentNameValue) {
    setLogoGeneratorSourceTitle(agentName, true);
    triggerLogoGeneration(220);
    return;
  }

  lastAgentNameValue = agentName;
}

function setHeroGeneratorSource(imageData = '', fileName = '') {
  state.heroGeneratorImageData = String(imageData || '');
  state.heroGeneratorImageName = String(fileName || '').trim();
  updateHeroFileLabel();
}

function updateHeroFileLabel() {
  const name = state.heroGeneratorImageName || 'No image selected';
  const label = document.getElementById('hero_generator_file_name');
  label.textContent = name;
  label.title = name;
}

async function chooseHeroImage() {
  const data = await api('/api/pick-hero-image', { method: 'POST' });
  if (data.canceled) {
    setStatus('Image selection canceled', 'normal');
    return;
  }
  setHeroGeneratorSource(data.image_data || data.imageData || '', data.file_name || data.fileName || '');
  if (!state.heroGeneratorImageData) {
    setStatus('Choose a PNG, JPG, or GIF image', 'error');
    return;
  }
  setStatus('Generating hero art...', 'normal');
  triggerHeroGeneration();
}

function handleHeroStyleChange() {
  if (!state.heroGeneratorImageData) return;
  setStatus('Updating hero art...', 'normal');
  triggerHeroGeneration();
}

function handleHeroWidthChange(delay = 180) {
  if (!state.heroGeneratorImageData) return;
  setStatus('Updating hero art...', 'normal');
  triggerHeroGeneration(delay);
}

function triggerHeroGeneration(delay = 0) {
  window.clearTimeout(heroGenerateTimer);
  heroGenerateTimer = window.setTimeout(() => {
    generateHeroFromImage().catch((error) => setStatus(error.message, 'error'));
  }, delay);
}

async function generateHeroFromImage() {
  if (!state.heroGeneratorImageData) {
    setStatus('Choose a PNG, JPG, or GIF to generate hero art', 'error');
    return;
  }

  const style = document.getElementById('hero_generator_style').value || 'braille';
  const width = clampInteger(document.getElementById('hero_generator_width').value, 40, 16, 60);
  document.getElementById('hero_generator_width').value = String(width);

  const data = await api('/api/generate-hero', {
    method: 'POST',
    body: JSON.stringify({
      image_data: state.heroGeneratorImageData,
      style,
      width
    })
  });

  document.getElementById('banner_hero_ascii').value = data.ascii || '';
  autoGrowTextarea(document.getElementById('banner_hero_ascii'));
  syncFromForm();
  queueViewportRecovery([0, 180, 520, 1000]);
  setStatus(`Generated ${data.options.style} hero art at ${data.options.width} x ${data.options.height}`, 'ok');
}

function openDraftSkin(skin, statusText = '') {
  state.currentName = skin.name;
  state.currentSource = 'user';
  applySkinToForm(skin);
  renderSkinLists();
  if (statusText) setStatus(statusText, 'ok');
}

function clearWorkspaceSelection() {
  state.hasSelection = false;
  state.currentName = '';
  state.currentSource = 'user';
  state.selectedSkin = blankSkin('custom-skin');
  setHeroGeneratorSource('', '');
  updateEditorLabels();
  updateWorkspaceState();
  renderSkinLists();
}

async function confirmCreateFromModal() {
  const { skin, statusText } = await buildSkinFromCreateModal();
  openDraftSkin(skin, statusText);
  setInspectorSection('section-skin');
  closeCreateModal();
}

function cloneCurrent() {
  if (!state.hasSelection) {
    setStatus('Select a skin', 'error');
    return;
  }

  syncFromForm();
  const skin = structuredClone(state.selectedSkin);
  skin.name = getUniqueSkinName(`${skin.name}-copy`);
  skin.description = skin.description ? `${skin.description} copy` : 'Cloned skin';
  openDraftSkin(skin, `Cloned ${state.selectedSkin.name}`);
  setInspectorSection('section-skin');
}

async function saveSkin() {
  if (!state.hasSelection) {
    setStatus('Create or load a skin before saving', 'error');
    return;
  }
  syncFromForm();
  const skin = state.selectedSkin;
  const exists = state.userSkins.some((item) => item.name === skin.name);
  const method = exists ? 'PUT' : 'POST';
  const path = method === 'PUT' ? `/api/skins/${encodeURIComponent(skin.name)}` : '/api/skins';
  const data = await api(path, { method, body: JSON.stringify(skin) });
  state.currentName = data.skin.name;
  state.currentSource = 'user';
  await refreshStatus();
  setStatus(`Saved ${data.skin.name}`, 'ok');
}

async function activateCurrent() {
  if (!state.hasSelection) {
    setStatus('Create or load a skin before activating', 'error');
    return;
  }
  syncFromForm();
  const skin = state.selectedSkin;
  await saveSkin();
  await api(`/api/activate/${encodeURIComponent(skin.name)}`, { method: 'POST' });
  await refreshStatus();
  setStatus(`Activated ${skin.name}`, 'ok');
}

async function deleteCurrent() {
  if (state.currentSource !== 'user' || !state.userSkins.some((item) => item.name === state.currentName)) {
    setStatus('Only saved custom skins can be deleted', 'error');
    return;
  }
  const yes = window.confirm(`Delete skin "${state.currentName}"?`);
  if (!yes) return;
  await api(`/api/skins/${encodeURIComponent(state.currentName)}`, { method: 'DELETE' });
  await refreshStatus();
  clearWorkspaceSelection();
  setStatus('Skin deleted', 'ok');
}

async function copyYaml() {
  await navigator.clipboard.writeText(yamlOutput.value);
  setStatus('YAML copied', 'ok');
}

function bindFormEvents() {
  document.querySelectorAll('#inspectorWorkspace input, #inspectorWorkspace textarea').forEach((el) => {
    if (el.id === 'yamlOutput') return;
    const syncWithAutoGrow = () => {
      autoGrowTextarea(el);
      syncFromForm();
    };
    el.addEventListener('input', syncWithAutoGrow);
    el.addEventListener('change', syncWithAutoGrow);
  });
}

async function init() {
  initColorGrid();
  recoverViewportLayout();
  bindInspectorSectionNav();
  bindInspectorScrollTracking();
  setInspectorSection(state.activeInspectorSection);
  bindPreviewFocusTargets();
  bindFormEvents();
  updateEditorLabels();
  updateWorkspaceState();
  refreshAutoGrowTextareas();
  await refreshLogoStyles();
  await refreshHeroStyles();
  document.getElementById('logo_generator_title').addEventListener('input', () => handleLogoGeneratorTitleInput(220));
  document.getElementById('logo_generator_style').addEventListener('change', () => triggerLogoGeneration());
  document.getElementById('agent_name').addEventListener('input', handleAgentNameChange);
  document.getElementById('agent_name').addEventListener('change', handleAgentNameChange);
  document.getElementById('heroPickerButton').addEventListener('click', () => {
    setStatus('Opening system image picker...', 'normal');
    chooseHeroImage().catch((error) => setStatus(error.message, 'error'));
  });
  document.getElementById('hero_generator_style').addEventListener('change', handleHeroStyleChange);
  document.getElementById('hero_generator_width').addEventListener('input', () => handleHeroWidthChange(220));
  document.getElementById('hero_generator_width').addEventListener('change', () => handleHeroWidthChange(0));
  updateHeroFileLabel();
  cloneButton.addEventListener('click', cloneCurrent);
  saveButton.addEventListener('click', () => saveSkin().catch((error) => setStatus(error.message, 'error')));
  activateButton.addEventListener('click', () => activateCurrent().catch((error) => setStatus(error.message, 'error')));
  document.getElementById('deleteButton').addEventListener('click', () => {
    setInspectorSection('section-skin', { scroll: true });
    deleteCurrent().catch((error) => setStatus(error.message, 'error'));
  });
  document.getElementById('createButton').addEventListener('click', () => openCreateModal('blank'));
  document.getElementById('copyYamlButton').addEventListener('click', () => copyYaml().catch((error) => setStatus(error.message, 'error')));
  document.getElementById('confirmCreateButton').addEventListener('click', () => confirmCreateFromModal().catch((error) => setStatus(error.message, 'error')));
  document.getElementById('closeCreateModalButton').addEventListener('click', closeCreateModal);
  document.getElementById('cancelCreateButton').addEventListener('click', closeCreateModal);
  createModal.addEventListener('click', (event) => {
    if (event.target === createModal) closeCreateModal();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !createModal.hidden) closeCreateModal();
  });
  createModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      state.createNameDirty = false;
      setCreateMode(button.dataset.createMode || 'blank', { forceName: true });
    });
  });
  createPresetSelect.addEventListener('change', () => syncCreateNameSuggestion());
  createExistingSelect.addEventListener('change', () => syncCreateNameSuggestion());
  createSkinNameInput.addEventListener('input', () => {
    state.createNameDirty = true;
  });
  createSkinNameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    confirmCreateFromModal().catch((error) => setStatus(error.message, 'error'));
  });
  window.addEventListener('resize', scheduleViewportSync);
  window.addEventListener('focus', () => {
    if (nativeFileDialogOpen) {
      endNativeFileDialog([0, 120, 360, 900, 1500]);
      return;
    }
    queueViewportRecovery();
  });
  window.addEventListener('pageshow', () => {
    if (nativeFileDialogOpen) {
      endNativeFileDialog([0]);
      return;
    }
    queueViewportRecovery([0]);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (nativeFileDialogOpen) {
      endNativeFileDialog([0, 120, 360, 900, 1500]);
      return;
    }
    queueViewportRecovery();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleViewportSync);
  }
  if ('ResizeObserver' in window) {
    const previewTerminal = document.getElementById('terminalPreview');
    if (previewTerminal instanceof HTMLElement) {
      const resizeObserver = new ResizeObserver(() => {
        if (nativeFileDialogOpen) return;
        fitStartupPreviewStage();
      });
      resizeObserver.observe(previewTerminal);
    }
  }
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => renderPreview()).catch(() => {});
  }
  await refreshStatus();
  clearWorkspaceSelection();
  if (!state.userSkins.length) {
    setStatus('No skins');
  } else {
    setStatus('Select a skin');
  }
}

init().catch((error) => setStatus(error.message, 'error'));
