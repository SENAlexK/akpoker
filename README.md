# AK Poker · 全栈德州扑克（No-Limit Hold'em）

一个真实玩法的在线德州扑克：注册/登录、自定义头像与昵称、自动积分结算、强随机且**可验证公平**的发牌、与真实规则一致的胜负判定、多人房间 + 邀请、桌内 **WebRTC 语音开麦**，桌面/手机自适应，可一键部署到一台 Linux VPS。

## 技术栈

全栈 TypeScript（pnpm monorepo）：

| 包 | 作用 |
|---|---|
| `@akpoker/shared` | 单一真相：wire 类型、Socket.IO 事件协议、zod 校验、常量 |
| `@akpoker/engine` | **纯**牌局引擎（无 I/O，可确定性重放）：洗牌、下注状态机、7选5评估、多边池、摊牌 |
| `@akpoker/server` | Fastify v5 + Socket.IO v4 + SQLite(better-sqlite3 + Drizzle) + 复式记账钱包 + 房间 + 语音信令 |
| `@akpoker/web` | React 19 + Vite + Tailwind v4 单页应用 |

后端**完全权威**；客户端只渲染快照。手牌只经 `user:<id>` 私有通道下发，public 负载结构上不含对手手牌（含 CI 级脱敏断言）。

## 本地开发

```bash
pnpm install
cp .env.example .env            # 开发默认值即可直接用
pnpm dev                        # 同时起 shared(watch) + server(:3001) + web(:5173)
```

打开 http://localhost:5173 —— Vite 把 `/api` 与 `/socket.io` 代理到 :3001。
开两个浏览器（或隐身窗口）各自注册一个账号即可对局。

## 校验与测试

```bash
pnpm build        # tsc -b：shared + engine + server 类型检查/编译
pnpm -F @akpoker/web typecheck
pnpm lint
pnpm test         # 全部 41 个测试
```

测试覆盖：引擎牌型评估（与 `pokersolver` 独立交叉验证 3000 手）、侧池/未跟注退还/奇数筹码、
随机整手**筹码守恒**属性测试、洗牌唯一性与 commit-reveal 可复现、鉴权流程、
以及**两客户端完整对局**集成测试（买入→摊牌→结算，脱敏 + 账本对账）。

## 可验证公平发牌（commit-reveal）

每手发牌前服务器公布 `deckCommit = sha256(serverSeed)`；手后通过 `hand:reveal`
揭示 `serverSeed / clientSeed / nonce / deckPermutation`。任何人都能用
HMAC-SHA256 DRBG 重算 52 张牌序并核验它与承诺、与实发牌一致 —— 服务器无法事后改牌。

## 积分与钱包（复式记账）

每一笔筹码流动都是一条**和为 0** 的账本分录；钱包/托管余额是可对账的缓存。
托管账户只在 **买入 / 补码 / 离桌 / 每手结算** 时写入，绝不每个下注动作写一笔。
注册赠送初始积分，积分见底可每日领取救济（纯朋友局，rake=0）。

## 管理（无需邮件服务）

```bash
pnpm -F @akpoker/server admin reset-password <email> <newPassword>
pnpm -F @akpoker/server admin set-points <email> <amount>
pnpm -F @akpoker/server admin ban|unban|make-admin <email>
pnpm -F @akpoker/server admin list
```

## 部署到 VPS

```bash
cp .env.example .env
# 必填：DOMAIN（解析到本机）、强随机 JWT_SECRET / COOKIE_SECRET、ALLOWED_ORIGINS=https://你的域名
# 语音（可选）：TURN_HOST=你的域名、TURN_STATIC_AUTH_SECRET=随机串、TURN_EXTERNAL_IP=公网IP
docker compose up -d --build
```

- **Caddy** 自动签发 HTTPS（Let's Encrypt），反代 `/api` 与 `/socket.io`（WSS，`read_timeout 0`），并由 app 同源伺服 SPA。
- **coturn** 提供 TURN（host 网络），用短时 HMAC 凭证；静态密钥不出后端。
- SQLite 与头像持久化在 `sqlite_data` 卷；证书状态持久化在 `caddy_data` 卷。
- 备份：`scripts/backup-sqlite.sh`（WAL 安全在线备份 + 轮转，建议加 host cron）。

> HTTPS 为硬性要求：浏览器麦克风（getUserMedia）与安全 Cookie 都需要安全上下文。

## 实现阶段

1. 地基（monorepo） 2. 集成契约（shared） 3. 牌局引擎 4. 鉴权/资料/DB
5. 实时单桌 + 钱包结算 6. 大厅/多房间/邀请 7. 语音 8. 自适应/i18n 9. 部署
