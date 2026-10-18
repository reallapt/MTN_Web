const playerUI = {
  meta: null,
  page: "home",
  players: { page: 1, controller: null, version: 0 },
  rankings: { page: 1, metric: "play_time", controller: null, version: 0 },
};
const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" });
const profileDialog = document.querySelector("#player-dialog");
let profileVersion = 0;
let searchTimer;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function displayName(player) {
  return player.name || "未记录名字";
}
function displayGroup(group) {
  return group === "default" ? "默认组" : group || "暂无身份组记录";
}
function displayMetric(value, metric) {
  if (value === null || value === undefined) return "暂无记录";
  if (metric === "play_time") {
    if (value < 60) return Math.floor(value) + " 秒";
    if (value < 3600) return Math.floor(value / 60) + " 分钟";
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value / 3600) + " 小时";
  }
  if (metric === "last_played") return dateFormat.format(new Date(value * 1000));
  return numberFormat.format(value);
}
function avatarMarkup(player, className = "player-avatar") {
  return '<img class="' + className + '" src="' + escapeHTML(player.avatar) + '" alt="' + (player.avatar_verified ? escapeHTML(displayName(player)) + ' 的头像' : '默认玩家头像') + '" width="64" height="64" loading="lazy" />';
}
async function apiJSON(url, signal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "读取失败，请稍后重试。");
  return data;
}
async function loadMeta(force = false) {
  if (playerUI.meta && !force) return playerUI.meta;
  const meta = await apiJSON("/api/meta");
  playerUI.meta = meta;
  document.querySelector("#player-count").textContent = numberFormat.format(meta.player_count);
  for (const selector of ["#player-group", "#ranking-group"]) {
    const select = document.querySelector(selector);
    const current = select.value;
    select.innerHTML = '<option value="">全部身份组</option>' + meta.groups.map((group) => '<option value="' + escapeHTML(group) + '">' + escapeHTML(displayGroup(group)) + '</option>').join("");
    select.value = current;
  }
  const skillSelect = document.querySelector("#ranking-skill");
  const currentSkill = skillSelect.value;
  skillSelect.innerHTML = '<option value="">选择技能排行榜</option>' + Object.entries(meta.skills).map(([key, label]) => '<option value="skill_' + key + '">' + escapeHTML(label) + '</option>').join("");
  skillSelect.value = currentSkill;
  return meta;
}
function pagerMarkup(data, view) {
  if (data.total === 0) return "";
  return '<span>共 ' + numberFormat.format(data.total) + ' 条记录</span><div><button type="button" data-pager="' + view + '" data-delta="-1"' + (data.page <= 1 ? ' disabled' : '') + '>上一页</button><span>' + data.page + ' / ' + data.pages + '</span><button type="button" data-pager="' + view + '" data-delta="1"' + (data.page >= data.pages ? ' disabled' : '') + '>下一页</button></div>';
}
function directoryMarkup(players) {
  return '<div class="directory-table-head"><span>玩家 / UUID</span><span>游玩时长</span><span>经验等级</span><span>挖掘方块</span><span>最近游玩（北京时间）</span></div>' + players.map((player) => '<button type="button" class="directory-row" data-player="' + player.uuid + '"><span class="player-identity">' + avatarMarkup(player) + '<span><strong>' + escapeHTML(displayName(player)) + '</strong><span class="group-tag">' + escapeHTML(displayGroup(player.group)) + '</span><small>' + player.uuid + '</small></span></span><span class="data-cell" data-label="游玩时长">' + displayMetric(player.play_time, "play_time") + '</span><span class="data-cell" data-label="经验等级">' + displayMetric(player.xp_level, "xp_level") + '</span><span class="data-cell" data-label="挖掘方块">' + displayMetric(player.mined, "mined") + '</span><span class="data-cell last-seen" data-label="最近游玩">' + displayMetric(player.last_played, "last_played") + '</span></button>').join("");
}
function rankingsMarkup(players, metric) {
  const label = playerUI.meta.metrics[metric];
  return players.map((player) => '<button type="button" data-player="' + player.uuid + '" class="ranking-row' + (player.rank === 1 ? ' ranking-first' : '') + '"><span class="rank-position">' + String(player.rank).padStart(2, "0") + '</span>' + avatarMarkup(player) + '<span class="ranking-identity"><strong>' + escapeHTML(displayName(player)) + '</strong><span>' + escapeHTML(displayGroup(player.group)) + '</span><small>' + player.uuid + '</small></span><span class="rank-value"><strong>' + displayMetric(player.value, metric) + '</strong><small>' + escapeHTML(label) + '</small></span><span class="row-arrow" aria-hidden="true">↗</span></button>').join("");
}
async function loadRecords(view, { quiet = false, force = false } = {}) {
  if (!["players", "rankings"].includes(view)) return;
  const state = playerUI[view];
  const version = ++state.version;
  state.controller?.abort();
  state.controller = new AbortController();
  const results = document.querySelector("#" + view + "-results");
  const status = document.querySelector("#" + view + "-status");
  results.setAttribute("aria-busy", "true");
  if (!quiet) status.textContent = "正在读取服务器记录…";
  try {
    await loadMeta(force);
    if (version !== state.version) return;
    const parameters = new URLSearchParams({ page: state.page, limit: view === "players" ? 12 : 15 });
    if (view === "players") {
      parameters.set("q", document.querySelector("#player-search").value.trim());
      parameters.set("group", document.querySelector("#player-group").value);
      parameters.set("sort", document.querySelector("#player-sort").value);
    } else {
      parameters.set("metric", state.metric);
      parameters.set("group", document.querySelector("#ranking-group").value);
    }
    const data = await apiJSON("/api/" + view + "?" + parameters, state.controller.signal);
    if (version !== state.version) return;
    state.page = data.page;
    if (view === "rankings") document.querySelector("#ranking-label").textContent = playerUI.meta.metrics[state.metric];
    results.innerHTML = data.items.length ? (view === "players" ? directoryMarkup(data.items) : rankingsMarkup(data.items, state.metric)) : '<div class="data-empty"><h3>暂时没有记录</h3><p>试试其他名字、身份组或排行项目。</p></div>';
    status.textContent = data.warnings.length ? data.warnings.join(" ") : "更新于 " + dateFormat.format(new Date(data.updated_at * 1000)) + " · 北京时间";
    status.classList.toggle("has-warning", Boolean(data.warnings.length));
    document.querySelector("#" + view + "-pagination").innerHTML = pagerMarkup(data, view);
  } catch (error) {
    if (error.name === "AbortError" || version !== state.version) return;
    status.textContent = "暂时无法更新，请点击刷新重试。";
    status.classList.add("has-warning");
    if (!results.children.length) results.innerHTML = '<div class="data-empty"><h3>玩家数据暂时不可用</h3><p>' + escapeHTML(error.message) + '</p><button type="button" class="button primary" data-refresh="' + view + '">重新读取</button></div>';
  } finally {
    if (version === state.version) results.setAttribute("aria-busy", "false");
  }
}
function profileMarkup(player) {
  const fields = [["play_time", "游玩时长"], ["xp_level", "经验等级"], ["mined", "方块挖掘"], ["mcmmo_total", "mcMMO 总等级"]];
  return '<div class="profile-heading">' + avatarMarkup(player, "profile-avatar") + '<div><span class="group-tag">' + escapeHTML(displayGroup(player.group)) + '</span><h2 id="profile-name">' + escapeHTML(displayName(player)) + '</h2><p>' + (player.avatar_verified ? '已匹配皮肤头像' : '暂无已验证皮肤，显示默认头像') + '</p></div></div><div class="profile-uuid"><span>UUID</span><code>' + player.uuid + '</code><button type="button" data-copy-uuid="' + player.uuid + '">复制</button></div><dl class="profile-stats">' + fields.map(([key, label]) => '<div><dt>' + label + '</dt><dd>' + displayMetric(player[key], key) + '</dd></div>').join("") + '</dl><div class="profile-last-seen"><span>最近游玩</span><strong>' + displayMetric(player.last_played, "last_played") + '</strong><small>北京时间 · 已保存记录</small></div><div class="profile-skills-heading"><h3>mcMMO 技能</h3><span>全部 ' + Object.keys(playerUI.meta.skills).length + ' 项</span></div>' + (player.skills ? '' : '<p class="skill-missing-note">暂无该 UUID 的 mcMMO 记录，缺失技能不计作零级。</p>') + '<dl class="profile-skills">' + Object.entries(playerUI.meta.skills).map(([key, label]) => '<div><dt>' + escapeHTML(label) + '</dt><dd>' + displayMetric(player.skills?.[key], key) + '</dd></div>').join("") + '</dl><p class="data-footnote">只展示公开统计，不展示背包、位置或私人记录。累计时长包含挂机，当前等级以最近保存的存档为准。</p>';
}
async function openPlayer(identifier, updateURL = true) {
  const version = ++profileVersion;
  const profile = document.querySelector("#player-profile");
  profile.innerHTML = '<h2 id="profile-name">正在读取档案…</h2>';
  if (!profileDialog.open) profileDialog.showModal();
  profileDialog.scrollTop = 0;
  if (updateURL) {
    const url = new URL(location.href);
    url.searchParams.set("player", identifier);
    history.replaceState(history.state, "", url);
  }
  try {
    await loadMeta();
    const data = await apiJSON("/api/players/" + encodeURIComponent(identifier));
    if (version !== profileVersion || !profileDialog.open) return;
    profile.innerHTML = profileMarkup(data.player);
  } catch (error) {
    if (version === profileVersion) profile.innerHTML = '<h2 id="profile-name">档案暂时不可用</h2><p class="data-status">' + escapeHTML(error.message) + '</p><button class="button primary" type="button" data-player="' + escapeHTML(identifier) + '">重试</button>';
  }
}
function activateDataPage(page) {
  playerUI.page = page;
  if (profileDialog.open) profileDialog.close();
  if (["players", "rankings"].includes(page)) {
    loadRecords(page);
    const identifier = new URL(location.href).searchParams.get("player");
    if (identifier) openPlayer(identifier, false);
  }
}
document.addEventListener("mtn:page", (event) => activateDataPage(event.detail.page));
document.querySelector("#players-filters").addEventListener("submit", (event) => event.preventDefault());
document.querySelector("#player-search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { playerUI.players.page = 1; loadRecords("players"); }, 250);
});
for (const selector of ["#player-group", "#player-sort"]) document.querySelector(selector).addEventListener("change", () => { playerUI.players.page = 1; loadRecords("players"); });
document.querySelector("#ranking-group").addEventListener("change", () => { playerUI.rankings.page = 1; loadRecords("rankings"); });
function selectMetric(metric) {
  playerUI.rankings.metric = metric;
  playerUI.rankings.page = 1;
  document.querySelectorAll("[data-metric]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.metric === metric)));
  document.querySelector("#ranking-skill").value = metric.startsWith("skill_") ? metric : "";
  loadRecords("rankings");
}
document.querySelector("#ranking-skill").addEventListener("change", (event) => { if (event.target.value) selectMetric(event.target.value); });
document.addEventListener("click", async (event) => {
  const player = event.target.closest("[data-player]");
  if (player) { openPlayer(player.dataset.player); return; }
  const metric = event.target.closest("[data-metric]");
  if (metric) { selectMetric(metric.dataset.metric); return; }
  const refresh = event.target.closest("[data-refresh]");
  if (refresh) { loadRecords(refresh.dataset.refresh, { force: true }); return; }
  const pager = event.target.closest("[data-pager]");
  if (pager) {
    playerUI[pager.dataset.pager].page += Number(pager.dataset.delta);
    await loadRecords(pager.dataset.pager);
    document.querySelector("#" + pager.dataset.pager + "-results").scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });
    return;
  }
  const copy = event.target.closest("[data-copy-uuid]");
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copyUuid); copy.textContent = "已复制"; }
    catch { showToast("请选中 UUID 手动复制。"); }
  }
});
document.querySelector("#close-player").addEventListener("click", () => profileDialog.close());
profileDialog.addEventListener("click", (event) => { if (event.target === profileDialog) { const bounds = profileDialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) profileDialog.close(); } });
profileDialog.addEventListener("close", () => {
  profileVersion += 1;
  const url = new URL(location.href);
  if (url.searchParams.has("player")) { url.searchParams.delete("player"); history.replaceState(history.state, "", url); }
});
document.addEventListener("error", (event) => { if (event.target.matches?.(".player-avatar, .profile-avatar") && !event.target.src.endsWith("/assets/default-avatar.png")) { event.target.src = "/assets/default-avatar.png"; event.target.alt = "默认玩家头像"; } }, true);
setInterval(() => { if (!document.hidden && ["players", "rankings"].includes(playerUI.page)) loadRecords(playerUI.page, { quiet: true, force: true }); }, 60000);
activateDataPage(document.body.dataset.page || "home");
