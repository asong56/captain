// providers/focus-guard-common.js
// Derived from LeechBlock NG common.js (MPL 2.0)
// Shared constants and pure utility functions used by focus-guard.js and options pages.

export const TIMEDATA_LEN = 9;
export const MAX_SETS     = 30;
export const ALL_DAY_TIMES = '0000-2400';
export const BLOCKED_PAGE  = 'pages/blocked.html';
export const DELAYED_PAGE  = 'pages/delayed.html';
export const PASSWORD_PAGE = 'pages/password.html';
export const DEFAULT_BLOCK_URL  = 'pages/blocked.html?$S&$U';
export const DELAYED_BLOCK_URL  = 'pages/delayed.html?$S&$U';
export const PASSWORD_BLOCK_URL = 'pages/password.html?$S&$U';

const PARSE_URL_RE = /^((([A-Za-z][\w\-.]*):\/*((?:\w+(?::\w+)?)@)?([\w.\-]+)(?::(\d*))?)?([^?#]*)(\?[^#]*)?(#.*)?)$/;
const ABSOLUTE_URL = /^[\w-]+:/;
export const INTERNAL_BLOCK_URL = /^(\w+\/)?(pages\/)?(blocked|delayed|password)\.html\?\$S&\$U$/;

const U_WORD_CHAR   = '[\\p{L}\\p{N}]';
const U_WORD_CHARS0 = `${U_WORD_CHAR}*`;
const U_WORD_BEGIN  = `(?<!${U_WORD_CHAR})(?=${U_WORD_CHAR})`;
const U_WORD_END    = `(?<=${U_WORD_CHAR})(?!${U_WORD_CHAR})`;

export const PER_SET_OPTIONS = {
  setName:         { type: 'string',  def: '' },
  sites:           { type: 'string',  def: '' },
  times:           { type: 'string',  def: '' },
  limitMins:       { type: 'string',  def: '' },
  limitPeriod:     { type: 'string',  def: '' },
  limitOffset:     { type: 'string',  def: '' },
  rollover:        { type: 'boolean', def: false },
  conjMode:        { type: 'boolean', def: false },
  days:            { type: 'array',   def: [false,true,true,true,true,true,false] },
  blockURL:        { type: 'string',  def: DEFAULT_BLOCK_URL },
  passwordRequire: { type: 'string',  def: '0' },
  passwordSetSpec: { type: 'string',  def: '' },
  customMsg:       { type: 'string',  def: '' },
  incogMode:       { type: 'string',  def: '0' },
  activeTabMode:   { type: 'string',  def: '0' },
  applyFilter:     { type: 'boolean', def: false },
  filterName:      { type: 'string',  def: 'grayscale' },
  filterMute:      { type: 'boolean', def: false },
  filterCustom:    { type: 'string',  def: '' },
  closeTab:        { type: 'boolean', def: false },
  activeBlock:     { type: 'boolean', def: false },
  minBlock:        { type: 'string',  def: '' },
  countFocus:      { type: 'boolean', def: true },
  countAudio:      { type: 'boolean', def: false },
  showKeyword:     { type: 'boolean', def: true },
  titleOnly:       { type: 'boolean', def: false },
  delayFirst:      { type: 'boolean', def: true },
  delayFirstMode:  { type: 'string',  def: '0' },
  delaySecs:       { type: 'string',  def: '60' },
  delayAllowMins:  { type: 'string',  def: '' },
  delayAutoLoad:   { type: 'boolean', def: true },
  delayCancel:     { type: 'boolean', def: true },
  reloadSecs:      { type: 'string',  def: '' },
  addHistory:      { type: 'boolean', def: false },
  allowOverride:   { type: 'boolean', def: false },
  allowOverLock:   { type: 'boolean', def: true },
  prevOpts:        { type: 'boolean', def: false },
  prevGenOpts:     { type: 'boolean', def: false },
  prevExts:        { type: 'boolean', def: false },
  prevSettings:    { type: 'boolean', def: false },
  prevOverride:    { type: 'boolean', def: false },
  disable:         { type: 'boolean', def: false },
  showTimer:       { type: 'boolean', def: true },
  allowRefers:     { type: 'boolean', def: false },
  allowKeywords:   { type: 'boolean', def: false },
  waitSecs:        { type: 'string',  def: '' },
  sitesURL:        { type: 'string',  def: '' },
  regexpBlock:     { type: 'string',  def: '' },
  regexpAllow:     { type: 'string',  def: '' },
  regexpKeyword:   { type: 'string',  def: '' },
  ignoreHash:      { type: 'boolean', def: true },
};

export const GENERAL_OPTIONS = {
  simplified:        { type: 'boolean', def: true },
  numSets:           { type: 'string',  def: '6' },
  theme:             { type: 'string',  def: '' },
  customStyle:       { type: 'string',  def: '' },
  oa:                { type: 'string',  def: '0' },
  password:          { type: 'string',  def: '' },
  hpp:               { type: 'boolean', def: true },
  apt:               { type: 'string',  def: '' },
  timerVisible:      { type: 'boolean', def: true },
  timerSize:         { type: 'string',  def: '1' },
  timerLocation:     { type: 'string',  def: '0' },
  timerMaxHours:     { type: 'string',  def: '24' },
  timerBadge:        { type: 'boolean', def: true },
  orm:               { type: 'string',  def: '' },
  orln:              { type: 'string',  def: '' },
  orlp:              { type: 'string',  def: '' },
  ora:               { type: 'string',  def: '0' },
  orcode:            { type: 'string',  def: '' },
  orp:               { type: 'string',  def: '' },
  orc:               { type: 'boolean', def: true },
  orlps:             { type: 'number',  def: 0 },
  orlc:              { type: 'number',  def: 0 },
  oret:              { type: 'number',  def: 0 },
  warnSecs:          { type: 'string',  def: '' },
  warnImmediate:     { type: 'boolean', def: true },
  contextMenu:       { type: 'boolean', def: true },
  matchSubdomains:   { type: 'boolean', def: false },
  disableLink:       { type: 'boolean', def: false },
  clockTimeFormat:   { type: 'string',  def: '0' },
  saveSecs:          { type: 'string',  def: '10' },
  clockOffset:       { type: 'string',  def: '' },
  ignoreJumpSecs:    { type: 'string',  def: '' },
  allFocused:        { type: 'boolean', def: false },
  useDocFocus:       { type: 'boolean', def: true },
  processTabsSecs:   { type: 'string',  def: '1' },
  processActiveTabs: { type: 'boolean', def: false },
  accessCodeImage:   { type: 'boolean', def: false },
  diagMode:          { type: 'boolean', def: false },
  exportPasswords:   { type: 'boolean', def: false },
  autoExportSync:    { type: 'boolean', def: true },
  lockdownHours:     { type: 'string',  def: '' },
  lockdownMins:      { type: 'string',  def: '' },
};

export function cleanOptions(options) {
  for (const name in GENERAL_OPTIONS) {
    const { type, def } = GENERAL_OPTIONS[name];
    if (typeof options[name] !== type) options[name] = def;
  }
  let numSets = +options['numSets'];
  numSets = Math.max(1, Math.min(MAX_SETS, Math.floor(numSets)));
  options['numSets'] = numSets.toString();
  for (const name in PER_SET_OPTIONS) {
    const { type, def } = PER_SET_OPTIONS[name];
    for (let set = 1; set <= numSets; set++) {
      if (type === 'array') {
        if (!Array.isArray(options[`${name}${set}`])) options[`${name}${set}`] = def.slice();
      } else if (typeof options[`${name}${set}`] !== type) {
        options[`${name}${set}`] = def;
      }
    }
  }
}

export function cleanTimeData(options) {
  const numSets     = +options['numSets'];
  const clockOffset = options['clockOffset'];
  const now = Math.floor(Date.now() / 1000) + (clockOffset * 60);
  for (let set = 1; set <= numSets; set++) {
    let timedata = options[`timedata${set}`];
    if (!Array.isArray(timedata)) {
      timedata = new Array(TIMEDATA_LEN).fill(0);
      timedata[0] = now;
    } else {
      while (timedata.length < TIMEDATA_LEN) timedata.push(0);
    }
    if (timedata[4] < now) timedata[4] = 0;
    if (timedata[8] < now) timedata[8] = 0;
    options[`timedata${set}`] = timedata;
  }
}

export function getParsedURL(url) {
  const results = PARSE_URL_RE.exec(url);
  if (results) {
    const page     = results[1];
    const host     = results[5];
    const path     = results[7];
    const query    = results[8];
    const fragment = results[9];
    return {
      pageNoArgs: page,
      page: query ? (page + query) : page,
      host,
      pathNoArgs: path,
      path: query ? (path + query) : path,
      query,
      args: query ? query.substring(1).split(/[;&]/) : null,
      hash: fragment ? fragment.substring(1) : null,
    };
  }
  return { pageNoArgs:null, page:null, host:null, pathNoArgs:null, path:null, query:null, args:null, hash:null };
}

export function cleanSites(sites) {
  sites = sites.replace(/(^\s+)|(\s+$)/g, '');
  const arr = sites.split(/\s+/);
  arr.forEach((item, i, a) => { a[i] = item.replace(/^([+>]?)[a-z-]+:\/+/, '$1'); });
  return arr.sort().join(' ');
}

export function getRegExpSites(sites, matchSubdomains) {
  if (!sites) return { block: '', allow: '', refer: '', keyword: '' };
  let blockFiles = false, allowFiles = false;
  const patterns = sites.split(/\s+/);
  const blocks = [], allows = [], refers = [], keywords = [];
  for (const pattern of patterns) {
    const first = pattern.charAt(0);
    if      (pattern === 'FILE')       { blockFiles = true; }
    else if (pattern === '+FILE')      { allowFiles = true; }
    else if (first === '~')            { keywords.push(keywordToRegExp(pattern.substr(1))); }
    else if (first === '>')            { refers.push(patternToRegExp(pattern.substr(1), matchSubdomains)); }
    else if (first === '+')            { allows.push(patternToRegExp(pattern.substr(1), matchSubdomains)); }
    else if (first !== '#')            { blocks.push(patternToRegExp(pattern, matchSubdomains)); }
  }
  return {
    block: blocks.length > 0
      ? '^' + (blockFiles ? 'file:|' : '') + '(https?|file):\\/+([\\w:]+@)?(' + blocks.join('|') + ')'
      : (blockFiles ? '^file:' : ''),
    allow: allows.length > 0
      ? '^' + (allowFiles ? 'file:|' : '') + '(https?|file):\\/+([\\w:]+@)?(' + allows.join('|') + ')'
      : (allowFiles ? '^file:' : ''),
    refer: refers.length > 0 ? '^(https?|file):\\/+([\\w:]+@)?(' + refers.join('|') + ')' : '',
    keyword: keywords.length > 0 ? U_WORD_BEGIN + '(' + keywords.join('|') + ')' + U_WORD_END : '',
  };
}

export function patternToRegExp(pattern, matchSubdomains) {
  const special    = /[.|?+^$()[\]{}\\/]/g;
  const subdomains = matchSubdomains ? '([^/]*\\.)?': '(www\\.)?';
  return subdomains + pattern
    .replace(special, '\\$&')
    .replace(/[\u0080-\uFFFF]/g, encodeURIComponent)
    .replace(/^www\\./, '')
    .replace(/\*\\+/g, '.+')
    .replace(/\*{2,}/g, '.{STAR}')
    .replace(/\*/g, '[^\\/]{STAR}')
    .replace(/{STAR}/g, '*');
}

export function keywordToRegExp(keyword) {
  const special = /[.|?+^$()[\]{}\\/]/g;
  return keyword
    .replace(special, '\\$&')
    .replace(/_+/g, '\\s+')
    .replace(/\*+/g, U_WORD_CHARS0);
}

export function getMinPeriods(times) {
  const minPeriods = [];
  if (times) {
    const regexp = /^(\d\d)(\d\d)-(\d\d)(\d\d)$/;
    for (const period of times.split(/[, ]+/)) {
      const r = regexp.exec(period);
      if (r) minPeriods.push({
        start: parseInt(r[1], 10) * 60 + parseInt(r[2], 10),
        end:   parseInt(r[3], 10) * 60 + parseInt(r[4], 10),
      });
    }
  }
  return minPeriods;
}

export function cleanTimePeriods(times) {
  let minPeriods = getMinPeriods(times);
  if (!minPeriods.length) return '';
  for (const mp of minPeriods) { mp.start = Math.min(mp.start, 1440); mp.end = Math.min(mp.end, 1440); }
  for (let i = 0; i < minPeriods.length; i++) {
    if (minPeriods[i].start >= minPeriods[i].end) minPeriods.splice(i--, 1);
  }
  minPeriods.sort((a, b) => a.start - b.start);
  for (let i = 0; i < minPeriods.length - 1; i++) {
    const mp1 = minPeriods[i], mp2 = minPeriods[i + 1];
    if (mp2.start <= mp1.end) { mp2.start = mp1.start; mp2.end = Math.max(mp1.end, mp2.end); minPeriods.splice(i--, 1); }
  }
  return minPeriods.map(mp => {
    const [h1, m1, h2, m2] = [Math.floor(mp.start/60), mp.start%60, Math.floor(mp.end/60), mp.end%60];
    const p = n => String(n).padStart(2, '0');
    return `${p(h1)}${p(m1)}-${p(h2)}${p(m2)}`;
  }).join(',');
}

export function getTimePeriodStart(now, limitPeriod, limitOffset) {
  limitPeriod = limitPeriod ? +limitPeriod : 3600;
  limitOffset = limitOffset ? +limitOffset : 0;
  if (limitPeriod > 0) {
    let periodStart = now - (now % limitPeriod);
    if (limitPeriod > 3600) {
      periodStart += limitOffset * 3600;
      periodStart += new Date(now * 1000).getTimezoneOffset() * 60;
      if (limitPeriod > 86400) periodStart -= 345600;
      while (periodStart > now)              periodStart -= limitPeriod;
      while (periodStart <= now - limitPeriod) periodStart += limitPeriod;
    }
    return periodStart;
  }
  return 0;
}

export function updateRolloverTime(timedata, limitMins, limitPeriod, periodStart) {
  if (limitMins && limitPeriod) {
    if (timedata[7] < periodStart) {
      timedata[5] = limitMins * 60; timedata[6] = limitMins * 60;
      timedata[7] = periodStart + +limitPeriod;
    } else if (timedata[7] === periodStart) {
      timedata[5] = timedata[6]; timedata[6] = limitMins * 60;
      timedata[7] = periodStart + +limitPeriod;
    }
  } else { timedata[5] = 0; timedata[6] = 0; timedata[7] = 0; }
}

// Optimization 4: use padStart instead of manual ternary padding
export function formatTime(secs) {
  const neg = secs < 0;
  secs = Math.abs(secs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor(secs / 60) % 60;
  const s = Math.floor(secs) % 60;
  const p = n => String(n).padStart(2, '0');
  return `${neg ? '-' : ''}${p(h)}:${p(m)}:${p(s)}`;
}

export function allTrue(array) {
  return Array.isArray(array) && array.every(Boolean);
}

export function encodeDays(days) {
  let code = 0;
  for (let i = 0; i < 7; i++) if (days[i]) code |= (1 << i);
  return code;
}

export function decodeDays(dayCode) {
  return Array.from({ length: 7 }, (_, i) => (dayCode & (1 << i)) !== 0);
}

export function createAccessCode(len) {
  const chars = '~!@#$%^&*()[]{}?+-=ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars.charAt(Math.random() * chars.length);
  return code;
}

export function getCleanURL(url) {
  if (!url) return url;
  if (url.startsWith('view-source:')) url = url.substring(12);
  if (url.startsWith('read:')) {
    const idx = url.indexOf('?url=');
    if (idx >= 0) url = decodeURIComponent(url.substring(idx + 5));
  }
  return url;
}

export function checkTimePeriodsFormat(times) {
  return times === '' || /^[0-2]\d[0-5]\d-[0-2]\d[0-5]\d([, ]+[0-2]\d[0-5]\d-[0-2]\d[0-5]\d)*$/.test(times);
}

export function checkPosIntFormat(value) {
  return value === '' || /^[1-9][0-9]*$/.test(value);
}

export function checkBlockURLFormat(url) {
  return INTERNAL_BLOCK_URL.test(url) || getParsedURL(url).page;
}

export function getTimestampSuffix() {
  return new Date().toISOString().substring(0, 19).replaceAll(':', '-');
}
