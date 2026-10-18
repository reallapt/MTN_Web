# MTNetwork 官网

黑色 #000000 与蓝色 #5b71f3 的中文官网，无前端构建依赖。HTML、CSS、JavaScript 分离，玩家数据由独立 Python 后端提供。

## 预览

执行 node server.js，然后访问 http://127.0.0.1:5173 。本地预览会将 /api/ 和 /avatars/ 代理至 http://192.168.9.4:5173；可通过 MTN_API_ORIGIN 指定其他 HTTP 后端地址。直接打开 HTML 只能浏览静态内容。

## 文件

- index.html：页面结构与文案。
- styles.css：独立样式、手机适配与减少动态效果设置。
- script.js：手机菜单、顶部轮播、站内动画路由和群号复制。
- players.js：玩家搜索、身份组筛选、排序、分页、档案弹层和排行榜。
- backend/app.py：存档 NBT / JSON 读取、MySQL 只读查询和同源 HTTP 接口。
- deploy/mtn-web.service：systemd 用户服务配置。
- assets/：已下载至本地的旧站实景、Minecraft 字体和图标。

## 玩家数据与排名

- 以 UUID 关联存档、mcMMO 和 LuckPerms，不根据同名自动合并。统计目录中的历史账号也保留；缺失名字显示“未记录名字”，缺失技能、等级或身份组不伪造为零或默认身份组。
- world/playerdata 提供经验等级与 Bukkit 保存的游玩时间；world/stats 提供累计游玩 tick 和方块挖掘总次数。play_time 按每秒 20 tick 换算，包含挂机，不等于精确的现实时间。
- mcMMO 提供全部 17 项技能等级和综合等级；LuckPerms 提供 primary_group。网站显示的 default 标签为“默认组”。最近游玩取存档 lastPlayed 与 mcMMO lastlogin 中较新的记录，并不是在线状态。日期统一显示北京时间。
- 共 22 个数值/时间排行：时长、经验等级、挖掘量、最近游玩、mcMMO 综合及 17 项技能。同值并列排名，缺失项不参加该项排名。筛选身份组后保留全服名次。名字、UUID 和身份组提供玩家列表排序，身份组另有筛选，不人为给身份排高低。
- 后端每轮读取完成后间隔 30 秒刷新，网页每 60 秒检查更新并支持手动刷新。游戏未保存到磁盘的数据不会立即反映；读取异常有明确提示。位置、背包、聊天和密码不会进入接口。

## 头像

默认头像为服务器 BlueMap 自带的 Steve 头像，不通过离线 UUID 猜测正版皮肤。只有确认与玩家匹配的头像才放入服务器 private/avatars/UUID.png，刷新后自动使用。该目录中的图片须是已经裁好的头像 PNG；网页不直接裁切整张皮肤。该目录不会入库，只有格式合法 UUID 的 PNG 可经 /avatars/ 路由读取。

## 后端运行与安全

服务器使用 Python 3.12 标准库与 mysql 命令行客户端，无需安装前端构建工具。MySQL 专用账号仅有 mcMMO.mcmmo_users、mcMMO.mcmmo_skills、LuckPerms.luckperms_players 三张表的 SELECT 权限，没有写入权限。凭据保存在服务器 private/mysql.cnf，目录权限 700、配置权限 600，不放进前端或 Git。静态文件按白名单提供，后端源码、Git、凭据和原始存档不可经 HTTP 下载。

以 mtnserver 用户运行：

    systemctl --user status mtn-web
    systemctl --user restart mtn-web
    journalctl --user -u mtn-web -n 50

已启用用户服务及 linger，SSH 断开后继续运行、开机自启。服务监听 0.0.0.0:5173。公网发布前应使用正式反向代理配置 HTTPS、连接与速率限制，并按实际需要限制防火墙来源；当前是内网部署。

接口：GET /api/meta；GET /api/players?q=名字或UUID&sort=play_time&group=&page=1；GET /api/players/UUID；GET /api/rankings?metric=play_time&group=&page=1。分页默认 12 条、最大 50 条。MTN_SERVER_ROOT、MTN_DB_CONFIG、MTN_BIND、PORT 可覆盖默认服务配置。迁移到新服务器时应单独创建只读数据库账号，不复制管理员凭据。
