import gzip
import io
import json
import logging
import math
import mimetypes
import os
import pathlib
import re
import struct
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit


ROOT = pathlib.Path(__file__).resolve().parent.parent
SERVER_ROOT = pathlib.Path(os.environ.get("MTN_SERVER_ROOT", "/home/mtnserver/nvme/MTN"))
CONFIG = pathlib.Path(os.environ.get("MTN_DB_CONFIG", str(ROOT / "private/mysql.cnf")))
UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SKILLS = {
    "taming": "驯兽", "mining": "挖矿", "woodcutting": "伐木",
    "repair": "修理", "unarmed": "徒手", "herbalism": "草药学",
    "excavation": "挖掘", "archery": "箭术", "swords": "剑术",
    "axes": "斧技", "acrobatics": "杂技", "fishing": "钓鱼",
    "alchemy": "炼金术", "crossbows": "弩术", "tridents": "三叉戟",
    "maces": "重锤", "spears": "长矛",
}
METRICS = {
    "play_time": "游玩时长", "xp_level": "经验等级", "mcmmo_total": "mcMMO 总等级",
    "mined": "方块挖掘", "last_played": "最近游玩",
    **{"skill_" + key: label for key, label in SKILLS.items()},
}


class NBTReader:
    def __init__(self, content):
        self.stream = io.BytesIO(content)

    def number(self, format_code):
        return struct.unpack(">" + format_code, self.stream.read(struct.calcsize(">" + format_code)))[0]

    def text(self):
        return self.stream.read(self.number("H")).decode("utf-8", "replace")

    def value(self, kind):
        formats = {1: "b", 2: "h", 3: "i", 4: "q", 5: "f", 6: "d"}
        if kind in formats:
            return self.number(formats[kind])
        if kind == 7:
            return self.stream.read(self.number("i"))
        if kind == 8:
            return self.text()
        if kind == 9:
            item_kind, length = self.number("B"), self.number("i")
            return [self.value(item_kind) for unused in range(length)]
        if kind == 10:
            result = {}
            while True:
                item_kind = self.number("B")
                if not item_kind:
                    return result
                name = self.text()
                result[name] = self.value(item_kind)
        if kind in (11, 12):
            return [self.number("i" if kind == 11 else "q") for unused in range(self.number("i"))]
        raise ValueError("Unsupported NBT tag")

    def document(self):
        kind = self.number("B")
        self.text()
        return self.value(kind)


def normalize_uuid(value):
    value = str(value).lower()
    if re.fullmatch(r"[0-9a-f]{32}", value):
        value = f"{value[:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
    return value if UUID_PATTERN.fullmatch(value) else None


def mysql_rows(query):
    if not CONFIG.is_file():
        raise RuntimeError("Database configuration missing")
    result = subprocess.run(
        ["mysql", "--defaults-extra-file=" + str(CONFIG), "--batch", "--raw", "--skip-column-names", "--connect-timeout=3"],
        input=query, capture_output=True, text=True, timeout=10,
    )
    if result.returncode:
        raise RuntimeError("Database unavailable")
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def new_player(identifier):
    return {
        "uuid": identifier, "name": None, "play_time": None,
        "xp_level": None, "mined": None, "last_played": None,
        "first_played": None, "group": None, "skills": None,
        "mcmmo_total": None, "avatar": "/assets/default-avatar.png",
        "avatar_verified": False,
    }


def collect_players():
    players, warnings = {}, []

    def ensure(identifier):
        identifier = normalize_uuid(identifier)
        if not identifier:
            return None
        return players.setdefault(identifier, new_player(identifier))

    try:
        names = {
            normalize_uuid(row["uuid"]): row["name"]
            for row in json.loads((SERVER_ROOT / "usercache.json").read_text())
        }
    except (OSError, ValueError, KeyError):
        names = {}
        warnings.append("玩家名字缓存暂时不可用。")
    world = SERVER_ROOT / "world"
    if not (world / "playerdata").is_dir() or not (world / "stats").is_dir():
        warnings.append("存档目录暂时不可用，部分数据未能读取。")
    failed_files = 0
    for filename in sorted((world / "playerdata").glob("*.dat")):
        try:
            player = ensure(filename.stem)
            if player is None:
                continue
            data = NBTReader(gzip.decompress(filename.read_bytes())).document()
            bukkit = data.get("bukkit", {})
            player["name"] = bukkit.get("lastKnownName") or names.get(player["uuid"])
            player["xp_level"] = data.get("XpLevel")
            for source, target in [("firstPlayed", "first_played"), ("lastPlayed", "last_played")]:
                value = bukkit.get(source)
                if isinstance(value, (int, float)) and value > 0:
                    player[target] = int(value / 1000)
        except (OSError, ValueError, EOFError, struct.error, TypeError):
            failed_files += 1
    for filename in sorted((world / "stats").glob("*.json")):
        try:
            player = ensure(filename.stem)
            if player is None:
                continue
            stats = json.loads(filename.read_text()).get("stats", {})
            custom = stats.get("minecraft:custom", {})
            ticks = custom.get("minecraft:play_time", custom.get("minecraft:play_one_minute"))
            player["play_time"] = round(ticks / 20, 2) if isinstance(ticks, (int, float)) else None
            player["mined"] = sum(stats.get("minecraft:mined", {}).values())
            player["name"] = player["name"] or names.get(player["uuid"])
        except (OSError, ValueError, TypeError):
            failed_files += 1
    skill_pairs = ", ".join("'" + key + "', s." + key for key in SKILLS)
    try:
        rows = mysql_rows(
            "SELECT JSON_OBJECT('uuid', u.uuid, 'name', u.user, 'lastlogin', u.lastlogin, "
            "'total', s.total, 'skills', IF(s.user_id IS NULL, NULL, JSON_OBJECT(" + skill_pairs + "))) "
            "FROM mcMMO.mcmmo_users u LEFT JOIN mcMMO.mcmmo_skills s ON s.user_id = u.id;"
        )
        for row in rows:
            player = ensure(row["uuid"])
            if player is None:
                continue
            player["name"] = row["name"] or player["name"]
            player["skills"] = row["skills"]
            player["mcmmo_total"] = row["total"]
            if row.get("lastlogin"):
                player["last_played"] = max(player["last_played"] or 0, row["lastlogin"])
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired):
        warnings.append("mcMMO 数据暂时不可用，未用零级替代缺失记录。")
    try:
        for row in mysql_rows("SELECT JSON_OBJECT('uuid', uuid, 'name', username, 'group', primary_group) FROM LuckPerms.luckperms_players;"):
            player = ensure(row["uuid"])
            if player is not None:
                player["name"] = player["name"] or row["name"]
                player["group"] = row["group"]
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired):
        warnings.append("身份组数据暂时不可用。")
    if failed_files:
        warnings.append(f"有 {failed_files} 份存档暂时未能读取，将在下一轮更新时重试。")
    for player in players.values():
        player["name"] = player["name"] or names.get(player["uuid"])
        avatar = ROOT / "private/avatars" / (player["uuid"] + ".png")
        if avatar.is_file():
            player["avatar"] = "/avatars/" + player["uuid"] + ".png"
            player["avatar_verified"] = True
    return list(players.values()), warnings


class PlayerCache:
    def __init__(self):
        self.lock = threading.Lock()
        self.ready = threading.Event()
        self.players = []
        self.warnings = []
        self.updated = 0

    def refresh(self):
        while True:
            try:
                players, warnings = collect_players()
                with self.lock:
                    self.players, self.warnings, self.updated = players, warnings, int(time.time())
                self.ready.set()
            except Exception:
                logging.exception("Player refresh failed")
                with self.lock:
                    self.warnings = ["数据更新暂时失败，当前显示最近一次成功读取的记录。"]
            time.sleep(30)

    def snapshot(self):
        if not self.ready.wait(2):
            return None
        with self.lock:
            return self.players[:], self.warnings[:], self.updated


CACHE = PlayerCache()


def metric_value(player, metric):
    if metric.startswith("skill_"):
        return (player.get("skills") or {}).get(metric[6:])
    return player.get(metric)


def summary(player):
    return {key: value for key, value in player.items() if key != "skills"}


class Handler(BaseHTTPRequestHandler):
    server_version = "MTNetwork"

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def send_content(self, status, content, content_type="application/json; charset=utf-8", cache="no-store"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def send_json(self, status, payload):
        self.send_content(status, json.dumps(payload, ensure_ascii=False, allow_nan=False).encode())

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        try:
            url = urlsplit(self.path)
            pathname = unquote(url.path)
            if pathname.startswith("/api/"):
                self.api(pathname, parse_qs(url.query, max_num_fields=20))
                return
            if pathname.startswith("/avatars/"):
                filename = pathname.rsplit("/", 1)[-1]
                if not filename.endswith(".png") or not normalize_uuid(filename[:-4]):
                    self.send_json(404, {"error": "头像不存在"})
                    return
                target = ROOT / "private/avatars" / filename
                if not target.is_file():
                    target = ROOT / "assets/default-avatar.png"
            elif pathname in ("/", "/index.html", "/styles.css", "/script.js", "/players.js"):
                target = ROOT / ("index.html" if pathname == "/" else pathname[1:])
            elif pathname.startswith("/assets/"):
                target = (ROOT / pathname[1:]).resolve()
                if not target.is_relative_to((ROOT / "assets").resolve()):
                    self.send_json(404, {"error": "页面不存在"})
                    return
            else:
                self.send_json(404, {"error": "页面不存在"})
                return
            if not target.is_file():
                self.send_json(404, {"error": "文件不存在"})
                return
            content_type = mimetypes.guess_type(target)[0] or "application/octet-stream"
            if content_type.startswith("text/") or target.suffix == ".js":
                content_type += "; charset=utf-8"
            self.send_content(200, target.read_bytes(), content_type, "public, max-age=3600" if target.suffix in (".png", ".webp", ".otf") else "no-cache")
        except (ValueError, UnicodeError):
            self.send_json(400, {"error": "请求参数不正确"})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            logging.exception("Request failed")
            self.send_json(500, {"error": "服务暂时不可用，请稍后重试"})

    def api(self, pathname, query):
        snapshot = CACHE.snapshot()
        if snapshot is None:
            self.send_json(503, {"error": "正在读取玩家记录，请稍后重试"})
            return
        players, warnings, updated = snapshot
        base = {"updated_at": updated, "refresh_seconds": 30, "warnings": warnings}
        if pathname == "/api/meta":
            self.send_json(200, {**base, "player_count": len(players), "skills": SKILLS, "metrics": METRICS,
                "groups": sorted({player["group"] for player in players if player["group"]}),
                "named_count": sum(bool(player["name"]) for player in players)})
            return
        if pathname.startswith("/api/players/"):
            identifier = normalize_uuid(pathname.rsplit("/", 1)[-1])
            player = next((player for player in players if player["uuid"] == identifier), None)
            self.send_json(200 if player else 404, {**base, "player": player} if player else {"error": "未找到该玩家"})
            return
        if pathname not in ("/api/players", "/api/rankings"):
            self.send_json(404, {"error": "接口不存在"})
            return
        search = query.get("q", [""])[0].strip().casefold()[:100]
        group = query.get("group", [""])[0][:100]
        metric = query.get("metric", ["play_time"])[0]
        sort = query.get("sort", ["play_time"])[0]
        page = max(1, int(query.get("page", ["1"])[0]))
        limit = min(50, max(1, int(query.get("limit", ["12"])[0])))
        ranking = pathname == "/api/rankings"
        if (ranking and metric not in METRICS) or (not ranking and sort not in (*METRICS, "name", "uuid", "group")):
            self.send_json(400, {"error": "不支持的排序项目"})
            return
        key = metric if ranking else sort
        if ranking:
            players = [player for player in players if metric_value(player, key) is not None]
        if key in ("name", "uuid", "group"):
            players.sort(key=lambda player: (player[key] is None, str(player[key] or "").casefold(), player["uuid"]))
        else:
            players.sort(key=lambda player: (metric_value(player, key) is None, -(metric_value(player, key) or 0), (player["name"] or "").casefold(), player["uuid"]))
        ranked = []
        previous_value, previous_rank = object(), 0
        for index, player in enumerate(players, 1):
            item = summary(player)
            if ranking:
                value = metric_value(player, key)
                rank = previous_rank if value == previous_value else index
                item.update({"rank": rank, "value": value})
                previous_value, previous_rank = value, rank
            ranked.append(item)
        ranked = [player for player in ranked if (not group or player["group"] == group) and (not search or search in (player["name"] or "").casefold() or search in player["uuid"])]
        total = len(ranked)
        pages = max(1, math.ceil(total / limit))
        page = min(page, pages)
        start = (page - 1) * limit
        self.send_json(200, {**base, "items": ranked[start:start + limit], "total": total, "page": page, "pages": pages, "metric": key})


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    threading.Thread(target=CACHE.refresh, daemon=True).start()
    server = ThreadingHTTPServer((os.environ.get("MTN_BIND", "127.0.0.1"), int(os.environ.get("PORT", "5173"))), Handler)
    server.daemon_threads = True
    server.serve_forever()
