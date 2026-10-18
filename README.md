# MTNetwork 官网

黑色 #000000 与蓝色 #5b71f3 的中文官网，无前端构建依赖。品牌字标为蓝色 MTN 与白色 etwork。HTML、CSS、JavaScript 分离，玩家数据由独立 Python 后端提供。

## 预览

执行 node server.js，然后访问 http://127.0.0.1:5173 。本地预览会将 /api/ 和 /avatars/ 代理至 http://192.168.9.4:5173；可通过 MTN_API_ORIGIN 指定其他 HTTP 后端地址。直接打开 HTML 只能浏览静态内容。

服务器部署目录为 /home/mtnserver/nvme/Web，内网访问地址为 http://192.168.9.4:5173 。没有改动原来的 Apache/phpMyAdmin 站点，也没有绑定公网域名或配置 HTTPS。

## 文件

- index.html：页面结构与文案。
- styles.css：独立样式、手机适配与减少动态效果设置。
- script.js：手机菜单、顶部轮播、站内动画路由和群号复制。
- players.js：玩家搜索、身份组筛选、排序、分页、档案弹层和排行榜。
- backend/app.py：存档 NBT / JSON 读取、MySQL 只读查询和同源 HTTP 接口。
- deploy/mtn-web.service：systemd 用户服务配置。
- assets/：已下载至本地的旧站实景、Minecraft 字体和图标。

## 来源与维护

介绍、QQ群号及链接、图片和字体素材来自 https://public.mcmtn.net/ ，于 2026-10-17 迁移。布局全新设计。使用真实服务器截图，不以生成图片冒充服务器实景。土豆娘原图保留在介绍区。首页顶部使用全屏 31 张照片轮播，每 6 秒切换，从第 31 张回到第 1 张，持续循环；支持淡入淡出、手动暂停和前后切换。鼠标悬停或键盘聚焦不会中断自动轮播，仅在页面隐藏、轮播离屏或离开首页时自动暂停，返回后恢复。开启减少动态效果偏好时默认不自动播放。全站使用原首页大标题的系统字体，不再使用像素字体。31 张服务器原图用于顶部自动轮播，数据独立于页面 DOM；“世界一角”画廊与图片放大弹窗已移除。图片素材保存在 assets/gallery/。

导航栏始终使用纯黑背景并固定顶部，桌面高度 80px、手机高度 64px，字标左侧留白分别为 32px、16px。“加入我们”按钮有悬停、按压反馈；站内锚点采用平滑滚动并预留导航栏高度，避免内容被遮挡。

玩家与排行榜通过 ?page=players、?page=rankings 在同一份 index.html 中切换视图，带淡出与上移淡入动画，不重新加载 HTML。导航“文档”和首页“游玩文档”在当前标签页跳转至 https://docs.mcmtn.net/，旧的 ?page=docs 地址也会自动跳转，不再显示占位页。支持深链接、刷新、浏览器前进后退、导航选中态和回到首页；开启减少动态效果时直接切换视图。玩家档案支持通过 player=UUID 深链接打开。旧的 players.html 与 docs.html 已移除。不展示虚构在线人数或运行状态。连接地址及当前支持版本请通过群公告获取。

QQ群号在 index.html 和 script.js 中维护，修改时需同步更新复制内容。server.js 仅用于本地预览。

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
